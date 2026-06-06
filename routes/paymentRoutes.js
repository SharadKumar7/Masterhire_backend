// routes/payment.routes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createMilestoneOrder,
  verifyMilestonePayment,
  approveMilestone,
  createTopupOrder,
  verifyTopup,
  payMilestoneFromWallet,
  requestWithdrawal,
  cancelProject,
  getWallet,
  getTransactions,
} from "../controllers/paymentController.js";

const router = express.Router();

// ── Milestone payments ────────────────────────────────────────────────────────
router.post("/create-order",       protect, createMilestoneOrder);   // Client: pay milestone via Razorpay
router.post("/verify",             protect, verifyMilestonePayment);  // Client: verify Razorpay payment
router.post("/approve-milestone",  protect, approveMilestone);        // Client: approve & release to freelancer
router.post("/pay-from-wallet",    protect, payMilestoneFromWallet);  // Client: pay milestone from wallet

// ── Wallet top-up ─────────────────────────────────────────────────────────────
router.post("/topup/create-order", protect, createTopupOrder);        // Client: create top-up order
router.post("/topup/verify",       protect, verifyTopup);             // Client: verify top-up payment

// ── Freelancer withdrawal ─────────────────────────────────────────────────────
router.post("/withdraw",           protect, requestWithdrawal);       // Freelancer: withdraw funds

// ── Project cancellation ──────────────────────────────────────────────────────
router.post("/cancel-project",     protect, cancelProject);           // Client: cancel & refund

// ── Fetch data ────────────────────────────────────────────────────────────────
router.get("/wallet",              protect, getWallet);               // Any: get wallet info
router.get("/transactions",        protect, getTransactions);         // Any: get transaction history

export default router;