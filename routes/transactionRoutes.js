// routes/transactionRoutes.js
// Mount in app.js: app.use("/api", transactionRoutes);

import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getFreelancerTransactions,
  withdrawFunds,
  getClientTransactions,
  addFunds,
} from "../controllers/transactionControllers.js";

const router = express.Router();

// ── Freelancer ────────────────────────────────────────────────────────────────
router.get("/freelancer/transactions",  protect, getFreelancerTransactions);
router.post("/freelancer/withdraw",     protect, withdrawFunds);

// ── Client ────────────────────────────────────────────────────────────────────
router.get("/client/transactions",      protect, getClientTransactions);
router.post("/client/add-funds",        protect, addFunds);

export default router;