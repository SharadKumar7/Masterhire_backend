import mongoose from "mongoose";
import Wallet      from "../models/wallet.js";
import Transaction from "../models/Transaction.js";
import Withdrawal  from "../models/withdrawal.js";
import { createNotification } from "./notificationController.js"; // ✅ ADD THIS

// ─── Helper: get or create wallet ─────────────────────────────────────────────
const getOrCreateWallet = async (userId, role) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId, role });
  return wallet;
};

// ─── Helper: format date strings ──────────────────────────────────────────────
const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const formatTime = (d) =>
  new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

// ─── Helper: parse date range string ──────────────────────────────────────────
const parseDateRange = (rangeStr) => {
  try {
    if (!rangeStr) return { startDate: null, endDate: null };
    const parts = rangeStr.split(" - ");
    const year  = rangeStr.match(/\d{4}/)?.[0] || new Date().getFullYear();
    const start = new Date(`${parts[0]}, ${year}`);
    const end   = new Date(parts[1]);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  } catch {
    return { startDate: null, endDate: null };
  }
};

// ─── Helper: build chart data ──────────────────────────────────────────────────
const buildChartData = (transactions) => {
  const map = {};
  transactions.forEach((tx) => {
    const label = new Date(tx.dateValue).toLocaleDateString("en-IN", { month: "short", day: "2-digit" });
    map[label] = (map[label] || 0) + tx.amount;
  });
  return Object.entries(map).map(([label, value]) => ({ label, value }));
};

// ─── Helper: build breakdown data ─────────────────────────────────────────────
const buildBreakdown = (transactions) => {
  const map = {};
  let total = 0;
  transactions.forEach((tx) => {
    map[tx.type] = (map[tx.type] || 0) + tx.amount;
    total += tx.amount;
  });
  const COLORS = {
    "Milestone Payment": "#2dd4bf",
    "Milestone Release": "#2dd4bf",
    "Project Payment":   "#60a5fa",
    "Escrow Deposit":    "#34d399",
    "Wallet Top-up":     "#34d399",
    "Platform Fee":      "#fbbf24",
    "Withdrawal":        "#f87171",
    "Refund":            "#a78bfa",
    "Refund Received":   "#a78bfa",
  };
  return Object.entries(map).map(([label, value]) => ({
    label,
    value,
    pct:   total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    color: COLORS[label] || "#94a3b8",
  }));
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/freelancer/transactions
// ═══════════════════════════════════════════════════════════════════════════════
export const getFreelancerTransactions = async (req, res) => {
  try {
    const freelancerId = req.user.userId;
    const { range }    = req.query;
    const wallet = await getOrCreateWallet(freelancerId, "freelancer");

    const { startDate, endDate } = parseDateRange(range);
    const dateFilter = startDate && endDate
      ? { dateValue: { $gte: startDate, $lte: endDate } }
      : {};

    const now            = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [transactions, thisMonthTx, lastMonthTx] = await Promise.all([
      Transaction.find({ user: freelancerId, role: "freelancer", ...dateFilter }).sort({ dateValue: -1 }),
      Transaction.find({ user: freelancerId, role: "freelancer", isCredit: true, dateValue: { $gte: thisMonthStart } }),
      Transaction.find({ user: freelancerId, role: "freelancer", isCredit: true, dateValue: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
    ]);

    const platformFees = transactions.filter(t => t.type === "Platform Fee").reduce((s, t) => s + t.amount, 0);

    const metrics = [
      { id: "total-earnings",   label: "Total Earnings",   value: wallet.totalEarned,    subLabel: "Lifetime earnings",    subType: "positive", icon: "wallet",     color: "teal"  },
      { id: "available-balance",label: "Available Balance", value: wallet.balance,        subLabel: "Ready to withdraw",    subType: "neutral",  icon: "creditCard", color: "cyan"  },
      { id: "pending-release",  label: "Pending Release",  value: wallet.pendingRelease, subLabel: "Awaiting approval",    subType: "warning",  icon: "clock",      color: "amber" },
      { id: "total-withdrawn",  label: "Total Withdrawn",  value: wallet.totalWithdrawn, subLabel: "Lifetime withdrawals", subType: "neutral",  icon: "arrowUp",    color: "blue"  },
      { id: "platform-fees",    label: "Platform Fees",    value: platformFees,          subLabel: "Fees deducted",        subType: "negative", icon: "percent",    color: "rose"  },
      { id: "this-month",       label: "This Month",       value: thisMonthTx.reduce((s, t) => s + t.amount, 0), subLabel: "Earned this month", subType: "positive", icon: "arrowDown", color: "teal" },
    ];

    const creditTx  = transactions.filter(t => t.isCredit);
    const breakdown = buildBreakdown(creditTx);
    const totalCredit = creditTx.reduce((s, t) => s + t.amount, 0);

    const formatted = transactions.map((tx) => ({
      id:          tx._id,
      type:        tx.type,
      typeIcon:    tx.typeIcon,
      description: tx.description,
      project:     tx.project,
      amount:      tx.amount,
      isCredit:    tx.isCredit,
      status:      tx.status,
      date:        formatDate(tx.dateValue),
      time:        formatTime(tx.dateValue),
    }));

    res.status(200).json({
      metrics,
      transactions:      formatted,
      chartDataThisMonth: buildChartData(thisMonthTx),
      chartDataLastMonth: buildChartData(lastMonthTx),
      breakdown,
      totalForBreakdown:  totalCredit,
      availableBalance:   wallet.balance,
    });
  } catch (error) {
    console.error("getFreelancerTransactions error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/freelancer/withdraw
// ═══════════════════════════════════════════════════════════════════════════════
export const withdrawFunds = async (req, res) => {
  try {
    const freelancerId = req.user.userId;
    const { amount, method = "bank" } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const wallet = await getOrCreateWallet(freelancerId, "freelancer");
    if (Number(amount) > wallet.balance) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const withdrawAmount = Number(amount);
    wallet.balance        -= withdrawAmount;
    wallet.totalWithdrawn += withdrawAmount;
    await wallet.save();

    const withdrawal = await Withdrawal.create({
      user:   freelancerId,
      amount: withdrawAmount,
      method,
      status: "pending",
    });

    const now = new Date();
    await Transaction.create({
      user:        freelancerId,
      role:        "freelancer",
      type:        "Withdrawal",
      typeIcon:    "arrowUp",
      description: "Withdrawal initiated",
      project:     "—",
      amount:      withdrawAmount,
      isCredit:    false,
      status:      "Paid",
      date:        formatDate(now),
      time:        formatTime(now),
      dateValue:   now,
    });

    // ✅ Freelancer ko — withdrawal initiated notification
    await createNotification({
      userId:  freelancerId,
      type:    "PAYMENT_RECEIVED",
      title:   "Withdrawal Initiated",
      message: `Your withdrawal of ₹${withdrawAmount.toLocaleString("en-IN")} via ${method.toUpperCase()} has been initiated. Remaining balance: ₹${wallet.balance.toLocaleString("en-IN")}.`,
    });

    res.status(201).json({
      success:    true,
      message:    "Withdrawal initiated successfully",
      withdrawal: { _id: withdrawal._id, amount: withdrawal.amount, status: withdrawal.status },
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error("withdrawFunds error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/transactions
// ═══════════════════════════════════════════════════════════════════════════════
export const getClientTransactions = async (req, res) => {
  try {
    const clientId  = req.user.userId;
    const { range } = req.query;
    const wallet = await getOrCreateWallet(clientId, "client");

    const { startDate, endDate } = parseDateRange(range);
    const dateFilter = startDate && endDate
      ? { dateValue: { $gte: startDate, $lte: endDate } }
      : {};

    const now            = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [transactions, thisMonthTx, lastMonthTx] = await Promise.all([
      Transaction.find({ user: clientId, role: "client", ...dateFilter }).sort({ dateValue: -1 }),
      Transaction.find({ user: clientId, role: "client", isCredit: false, dateValue: { $gte: thisMonthStart } }),
      Transaction.find({ user: clientId, role: "client", isCredit: false, dateValue: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
    ]);

    const platformFees = transactions.filter(t => t.type === "Platform Fee").reduce((s, t) => s + t.amount, 0);

    const metrics = [
      { id: "total-spent",     label: "Total Spent",     value: wallet.totalSpent,     subLabel: "Lifetime spending",   subType: "negative", icon: "wallet",     color: "teal"  },
      { id: "escrow-held",     label: "Escrow Held",     value: wallet.escrowHeld,     subLabel: "In active contracts", subType: "neutral",  icon: "lock",       color: "blue"  },
      { id: "pending-release", label: "Pending Release", value: wallet.pendingRelease, subLabel: "Awaiting approval",   subType: "warning",  icon: "clock",      color: "amber" },
      { id: "wallet-balance",  label: "Wallet Balance",  value: wallet.balance,        subLabel: "Available to pay",    subType: "neutral",  icon: "creditCard", color: "cyan"  },
      { id: "total-released",  label: "Total Released",  value: wallet.totalReleased,  subLabel: "Paid to freelancers", subType: "positive", icon: "arrowUp",    color: "teal"  },
      { id: "platform-fees",   label: "Platform Fees",   value: platformFees,          subLabel: "Fees charged",        subType: "negative", icon: "percent",    color: "rose"  },
    ];

    const debitTx    = transactions.filter(t => !t.isCredit);
    const breakdown  = buildBreakdown(debitTx);
    const totalDebit = debitTx.reduce((s, t) => s + t.amount, 0);

    const formatted = transactions.map((tx) => ({
      id:          tx._id,
      type:        tx.type,
      typeIcon:    tx.typeIcon,
      description: tx.description,
      project:     tx.project,
      amount:      tx.amount,
      isCredit:    tx.isCredit,
      status:      tx.status,
      date:        formatDate(tx.dateValue),
      time:        formatTime(tx.dateValue),
    }));

    res.status(200).json({
      metrics,
      transactions:       formatted,
      chartDataThisMonth: buildChartData(thisMonthTx),
      chartDataLastMonth: buildChartData(lastMonthTx),
      breakdown,
      totalForBreakdown:  totalDebit,
      walletBalance:      wallet.balance,
    });
  } catch (error) {
    console.error("getClientTransactions error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/client/add-funds
// ═══════════════════════════════════════════════════════════════════════════════
export const addFunds = async (req, res) => {
  try {
    const clientId = req.user.userId;
    const { amount, method = "upi" } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const addAmount = Number(amount);
    const wallet    = await getOrCreateWallet(clientId, "client");

    wallet.balance += addAmount;
    await wallet.save();

    const now = new Date();
    await Transaction.create({
      user:        clientId,
      role:        "client",
      type:        "Wallet Top-up",
      typeIcon:    "arrowDown",
      description: `Added via ${method.toUpperCase()}`,
      project:     "—",
      amount:      addAmount,
      isCredit:    true,
      status:      "Completed",
      date:        formatDate(now),
      time:        formatTime(now),
      dateValue:   now,
    });

    // ✅ Client ko — wallet top-up notification
    await createNotification({
      userId:  clientId,
      type:    "PAYMENT_RECEIVED",
      title:   "Wallet Topped Up",
      message: `₹${addAmount.toLocaleString("en-IN")} added via ${method.toUpperCase()}. New balance: ₹${wallet.balance.toLocaleString("en-IN")}.`,
    });

    res.status(201).json({
      success:    true,
      message:    "Funds added successfully",
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error("addFunds error:", error);
    res.status(500).json({ message: "Server error" });
  }
};