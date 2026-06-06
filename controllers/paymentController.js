// controllers/payment.controller.js
import crypto          from "crypto";
import razorpay        from "../utils/razorpay.js";
import Job             from "../models/Jobs.js";
import Wallet          from "../models/wallet.js";
import Transaction     from "../models/Transaction.js";
import Withdrawal      from "../models/withdrawal.js";

const PLATFORM_FEE_PERCENT = 10; // 10%

// ─── Helper: format date/time for Transaction ────────────────────────────────
const formatDateTime = () => {
  const now = new Date();
  const date = now.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  const time = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return { date, time, dateValue: now };
};

// ─── Helper: get or create wallet ────────────────────────────────────────────
const getOrCreateWallet = async (userId, role) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await Wallet.create({ user: userId, role });
  }
  return wallet;
};

// =============================================================================
// 1. CREATE RAZORPAY ORDER — Client pays for a milestone
//    POST /api/payment/create-order
// =============================================================================
export const createMilestoneOrder = async (req, res) => {
  try {
    const { jobId, milestoneId } = req.body;
    const clientId = req.user._id;

    // Find job & milestone
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const milestone = job.milestones.id(milestoneId);
    if (!milestone) return res.status(404).json({ message: "Milestone not found" });

    if (milestone.isPaid) {
      return res.status(400).json({ message: "Milestone already paid" });
    }

    // Amount in paise (Razorpay uses paise)
    const amountInPaise = Math.round(milestone.budget * 100);

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount:   amountInPaise,
      currency: "INR",
      receipt:  `milestone_${milestoneId}`,
      notes: {
        jobId:       jobId.toString(),
        milestoneId: milestoneId.toString(),
        clientId:    clientId.toString(),
      },
    });

    // Save orderId to milestone
    milestone.razorpayOrderId = order.id;
    await job.save();

    res.status(200).json({
      success:  true,
      orderId:  order.id,
      amount:   amountInPaise,
      currency: "INR",
      key:      process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("createMilestoneOrder error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 2. VERIFY PAYMENT — After Razorpay success on frontend
//    POST /api/payment/verify
// =============================================================================
export const verifyMilestonePayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      jobId,
      milestoneId,
    } = req.body;

    const clientId = req.user._id;

    // ── Verify signature ──────────────────────────────────────────────────────
    const body      = razorpay_order_id + "|" + razorpay_payment_id;
    const expected  = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    // ── Find job & milestone ──────────────────────────────────────────────────
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const milestone = job.milestones.id(milestoneId);
    if (!milestone) return res.status(404).json({ message: "Milestone not found" });

    const amount = milestone.budget;

    // ── Update milestone ──────────────────────────────────────────────────────
    milestone.razorpayOrderId   = razorpay_order_id;
    milestone.razorpayPaymentId = razorpay_payment_id;
    milestone.escrowStatus      = "held";
    // Note: isPaid stays false until client approves milestone work

    // ── Activity log ──────────────────────────────────────────────────────────
    job.activityLog.push({
      label:   `Payment held in escrow for milestone: ${milestone.title}`,
      meta:    `₹${amount}`,
      primary: true,
    });

    await job.save();

    // ── Update client wallet ──────────────────────────────────────────────────
    const clientWallet = await getOrCreateWallet(clientId, "client");
    clientWallet.escrowHeld += amount;
    clientWallet.totalSpent += amount;
    await clientWallet.save();

    // ── Log client transaction ────────────────────────────────────────────────
    const { date, time, dateValue } = formatDateTime();
    await Transaction.create({
      user:              clientId,
      role:              "client",
      type:              "Escrow Deposit",
      typeIcon:          "arrowUp",
      description:       `Escrow held for milestone: ${milestone.title}`,
      project:           job.title,
      jobId:             job._id,
      amount,
      isCredit:          false,
      status:            "Held",
      date,
      time,
      dateValue,
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    res.status(200).json({
      success: true,
      message: "Payment verified. Funds held in escrow.",
    });
  } catch (err) {
    console.error("verifyMilestonePayment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 3. APPROVE MILESTONE — Client approves → release funds to freelancer wallet
//    POST /api/payment/approve-milestone
// =============================================================================
export const approveMilestone = async (req, res) => {
  try {
    const { jobId, milestoneId } = req.body;
    const clientId = req.user._id;

    const job = await Job.findById(jobId).populate("assignedFreelancer");
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Only client of this job can approve
    if (job.clientId.toString() !== clientId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const milestone = job.milestones.id(milestoneId);
    if (!milestone) return res.status(404).json({ message: "Milestone not found" });

    if (milestone.escrowStatus !== "held") {
      return res.status(400).json({ message: "Milestone not in escrow / already released" });
    }

    const freelancerId = job.assignedFreelancer._id;
    const grossAmount  = milestone.budget;

    // ── Calculate platform fee ────────────────────────────────────────────────
    const platformFee    = Math.round((grossAmount * PLATFORM_FEE_PERCENT) / 100);
    const freelancerGets = grossAmount - platformFee;

    // ── Update milestone ──────────────────────────────────────────────────────
    milestone.status        = "approved";
    milestone.isPaid        = true;
    milestone.paidAt        = new Date();
    milestone.paidAmount    = freelancerGets;
    milestone.escrowStatus  = "released";

    // ── Activity log ──────────────────────────────────────────────────────────
    job.activityLog.push({
      label:   `Milestone approved & payment released: ${milestone.title}`,
      meta:    `₹${freelancerGets} to freelancer (₹${platformFee} platform fee)`,
      primary: true,
    });

    await job.save();

    // ── Update client wallet ──────────────────────────────────────────────────
    const clientWallet = await getOrCreateWallet(clientId, "client");
    clientWallet.escrowHeld   = Math.max(0, clientWallet.escrowHeld - grossAmount);
    clientWallet.totalReleased += grossAmount;
    clientWallet.platformFeesPaid += platformFee;
    await clientWallet.save();

    // ── Update freelancer wallet ──────────────────────────────────────────────
    const freelancerWallet = await getOrCreateWallet(freelancerId, "freelancer");

    // Reset expiry date on new funds received
    freelancerWallet.walletExpiryDate = new Date(+new Date() + 30 * 24 * 60 * 60 * 1000);
    freelancerWallet.isExpired        = false;
    freelancerWallet.balance         += freelancerGets;
    freelancerWallet.totalEarned     += freelancerGets;
    freelancerWallet.platformFeesPaid += platformFee;
    await freelancerWallet.save();

    // ── Log transactions ──────────────────────────────────────────────────────
    const { date, time, dateValue } = formatDateTime();

    // Client side
    await Transaction.create({
      user:        clientId,
      role:        "client",
      type:        "Milestone Release",
      typeIcon:    "arrowUp",
      description: `Released payment for: ${milestone.title}`,
      project:     job.title,
      jobId:       job._id,
      amount:      grossAmount,
      isCredit:    false,
      status:      "Released",
      date, time, dateValue,
      razorpayOrderId:   milestone.razorpayOrderId,
      razorpayPaymentId: milestone.razorpayPaymentId,
    });

    // Freelancer — earning
    await Transaction.create({
      user:        freelancerId,
      role:        "freelancer",
      type:        "Milestone Payment",
      typeIcon:    "arrowDown",
      description: `Payment received for: ${milestone.title}`,
      project:     job.title,
      jobId:       job._id,
      amount:      freelancerGets,
      isCredit:    true,
      status:      "Paid",
      date, time, dateValue,
      razorpayOrderId:   milestone.razorpayOrderId,
      razorpayPaymentId: milestone.razorpayPaymentId,
    });

    // Freelancer — platform fee deducted
    await Transaction.create({
      user:        freelancerId,
      role:        "freelancer",
      type:        "Platform Fee",
      typeIcon:    "arrowUp",
      description: `Platform fee (10%) for: ${milestone.title}`,
      project:     job.title,
      jobId:       job._id,
      amount:      platformFee,
      isCredit:    false,
      status:      "Deducted",
      date, time, dateValue,
    });

    res.status(200).json({
      success:      true,
      message:      "Milestone approved. Payment released to freelancer.",
      freelancerGets,
      platformFee,
    });
  } catch (err) {
    console.error("approveMilestone error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 4. WALLET TOP-UP — Client adds money to wallet
//    POST /api/payment/topup/create-order
// =============================================================================
export const createTopupOrder = async (req, res) => {
  try {
    const { amount } = req.body; // amount in rupees
    if (!amount || amount < 1) {
      return res.status(400).json({ message: "Minimum top-up is ₹1" });
    }

    const order = await razorpay.orders.create({
      amount:   Math.round(amount * 100), // paise
      currency: "INR",
      receipt:  `topup_${req.user._id}_${Date.now()}`,
      notes:    { userId: req.user._id.toString(), type: "wallet_topup" },
    });

    res.status(200).json({
      success:  true,
      orderId:  order.id,
      amount:   Math.round(amount * 100),
      currency: "INR",
      key:      process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("createTopupOrder error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 5. VERIFY WALLET TOP-UP
//    POST /api/payment/topup/verify
// =============================================================================
export const verifyTopup = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount, // rupees
    } = req.body;

    const userId = req.user._id;

    // ── Verify signature ──────────────────────────────────────────────────────
    const body     = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    // ── Update client wallet ──────────────────────────────────────────────────
    const wallet = await getOrCreateWallet(userId, "client");
    wallet.balance      += Number(amount);
    wallet.totalSpent   += Number(amount);

    // Reset expiry on top-up
    wallet.walletExpiryDate = new Date(+new Date() + 30 * 24 * 60 * 60 * 1000);
    wallet.isExpired        = false;

    await wallet.save();

    // ── Log transaction ───────────────────────────────────────────────────────
    const { date, time, dateValue } = formatDateTime();
    await Transaction.create({
      user:              userId,
      role:              "client",
      type:              "Wallet Top-up",
      typeIcon:          "arrowDown",
      description:       `Wallet topped up with ₹${amount}`,
      amount:            Number(amount),
      isCredit:          true,
      status:            "Completed",
      date, time, dateValue,
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    res.status(200).json({
      success:    true,
      message:    `₹${amount} added to your wallet.`,
      newBalance: wallet.balance,
    });
  } catch (err) {
    console.error("verifyTopup error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 6. PAY MILESTONE FROM WALLET — Client pays using wallet balance
//    POST /api/payment/pay-from-wallet
// =============================================================================
export const payMilestoneFromWallet = async (req, res) => {
  try {
    const { jobId, milestoneId } = req.body;
    const clientId = req.user._id;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const milestone = job.milestones.id(milestoneId);
    if (!milestone) return res.status(404).json({ message: "Milestone not found" });

    if (milestone.isPaid || milestone.escrowStatus === "held") {
      return res.status(400).json({ message: "Milestone already paid" });
    }

    const amount = milestone.budget;

    // ── Check wallet balance ──────────────────────────────────────────────────
    const clientWallet = await getOrCreateWallet(clientId, "client");
    if (clientWallet.balance < amount) {
      return res.status(400).json({
        message: `Insufficient wallet balance. Need ₹${amount}, have ₹${clientWallet.balance}`,
      });
    }

    // ── Deduct from wallet, move to escrow ───────────────────────────────────
    clientWallet.balance    -= amount;
    clientWallet.escrowHeld += amount;
    clientWallet.totalSpent += amount;
    await clientWallet.save();

    // ── Update milestone ──────────────────────────────────────────────────────
    milestone.escrowStatus = "held";

    job.activityLog.push({
      label:   `Wallet payment held in escrow: ${milestone.title}`,
      meta:    `₹${amount}`,
      primary: true,
    });

    await job.save();

    // ── Log transaction ───────────────────────────────────────────────────────
    const { date, time, dateValue } = formatDateTime();
    await Transaction.create({
      user:        clientId,
      role:        "client",
      type:        "Escrow Deposit",
      typeIcon:    "arrowUp",
      description: `Wallet payment — escrow held for: ${milestone.title}`,
      project:     job.title,
      jobId:       job._id,
      amount,
      isCredit:    false,
      status:      "Held",
      date, time, dateValue,
    });

    res.status(200).json({
      success: true,
      message: "Milestone payment held in escrow from wallet.",
      newBalance: clientWallet.balance,
    });
  } catch (err) {
    console.error("payMilestoneFromWallet error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 7. FREELANCER WITHDRAWAL REQUEST
//    POST /api/payment/withdraw
// =============================================================================
export const requestWithdrawal = async (req, res) => {
  try {
    const { amount, method, upiId, bankDetails } = req.body;
    const freelancerId = req.user._id;

    if (!amount || amount < 1) {
      return res.status(400).json({ message: "Minimum withdrawal is ₹1" });
    }

    // ── Check wallet balance ──────────────────────────────────────────────────
    const wallet = await getOrCreateWallet(freelancerId, "freelancer");
    if (wallet.balance < amount) {
      return res.status(400).json({
        message: `Insufficient balance. Available: ₹${wallet.balance}`,
      });
    }

    // ── Deduct from wallet ────────────────────────────────────────────────────
    wallet.balance        -= amount;
    wallet.totalWithdrawn += amount;
    await wallet.save();

    // ── Create withdrawal record ──────────────────────────────────────────────
    const withdrawal = await Withdrawal.create({
      user:        freelancerId,
      amount,
      method:      method || "upi",
      status:      "completed", // simulated — no real payout API
      upiId:       method === "upi"  ? upiId       : null,
      bankDetails: method === "bank" ? bankDetails : {},
      platformFee: 0, // fee already deducted at milestone approval
      processedAt: new Date(),
      remarks:     "Demo payout — simulated transfer",
    });

    // ── Log transaction ───────────────────────────────────────────────────────
    const { date, time, dateValue } = formatDateTime();
    await Transaction.create({
      user:        freelancerId,
      role:        "freelancer",
      type:        "Withdrawal",
      typeIcon:    "arrowUp",
      description: `Withdrawal via ${method?.toUpperCase()} — ₹${amount}`,
      amount,
      isCredit:    false,
      status:      "Completed",
      date, time, dateValue,
    });

    res.status(200).json({
      success:      true,
      message:      `₹${amount} withdrawal successful.`,
      withdrawal,
      newBalance:   wallet.balance,
    });
  } catch (err) {
    console.error("requestWithdrawal error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 8. CANCEL PROJECT — Refund pending milestones to client wallet
//    POST /api/payment/cancel-project
// =============================================================================
export const cancelProject = async (req, res) => {
  try {
    const { jobId } = req.body;
    const clientId  = req.user._id;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.clientId.toString() !== clientId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    let totalRefund = 0;
    const { date, time, dateValue } = formatDateTime();

    // ── Refund all milestones that are "held" but not yet approved ─────────────
    for (const milestone of job.milestones) {
      if (milestone.escrowStatus === "held" && !milestone.isPaid) {
        totalRefund += milestone.budget;
        milestone.escrowStatus = "refunded";

        await Transaction.create({
          user:        clientId,
          role:        "client",
          type:        "Refund Received",
          typeIcon:    "arrowDown",
          description: `Refund for cancelled milestone: ${milestone.title}`,
          project:     job.title,
          jobId:       job._id,
          amount:      milestone.budget,
          isCredit:    true,
          status:      "Refunded",
          date, time, dateValue,
          razorpayOrderId:   milestone.razorpayOrderId   || null,
          razorpayPaymentId: milestone.razorpayPaymentId || null,
        });
      }
    }

    // ── Update client wallet ──────────────────────────────────────────────────
    if (totalRefund > 0) {
      const clientWallet = await getOrCreateWallet(clientId, "client");
      clientWallet.balance    += totalRefund;
      clientWallet.escrowHeld  = Math.max(0, clientWallet.escrowHeld - totalRefund);
      await clientWallet.save();
    }

    // ── Mark job cancelled ────────────────────────────────────────────────────
    job.status = "draft"; // or add "cancelled" to your enum
    job.activityLog.push({
      label:   "Project cancelled",
      meta:    totalRefund > 0 ? `₹${totalRefund} refunded to client wallet` : "No pending payments",
      primary: true,
    });

    await job.save();

    res.status(200).json({
      success:     true,
      message:     `Project cancelled. ₹${totalRefund} refunded to your wallet.`,
      totalRefund,
    });
  } catch (err) {
    console.error("cancelProject error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 9. GET WALLET — Get current user's wallet
//    GET /api/payment/wallet
// =============================================================================
export const getWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(
      req.user._id,
      req.user.role
    );
    res.status(200).json({ success: true, wallet });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// =============================================================================
// 10. GET TRANSACTIONS — Get transaction history
//     GET /api/payment/transactions
// =============================================================================
export const getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ dateValue: -1 })
      .limit(50);

    res.status(200).json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};