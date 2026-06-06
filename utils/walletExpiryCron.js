// utils/walletExpiryCron.js
import cron        from "node-cron";
import Wallet      from "../models/wallet.js";
import Transaction from "../models/Transaction.js";

/**
 * Runs every day at midnight.
 * If freelancer wallet has expired (1 month old with balance),
 * mark it expired and log a transaction (simulated auto-transfer to owner).
 */
const startWalletExpiryCron = () => {
  cron.schedule("0 0 * * *", async () => {
    console.log("⏰ Running wallet expiry check...");

    try {
      const now = new Date();

      // Find all freelancer wallets that have expired and still have balance
      const expiredWallets = await Wallet.find({
        role:             "freelancer",
        isExpired:        false,
        walletExpiryDate: { $lte: now },
        balance:          { $gt: 0 },
      });

      for (const wallet of expiredWallets) {
        const expiredAmount = wallet.balance;

        // Log transaction — simulated auto-transfer to platform owner
        const now2 = new Date();
        const date = now2.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
        const time = now2.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

        await Transaction.create({
          user:        wallet.user,
          role:        "freelancer",
          type:        "Withdrawal",
          typeIcon:    "arrowUp",
          description: "Wallet expired — balance auto-transferred to platform",
          amount:      expiredAmount,
          isCredit:    false,
          status:      "Completed",
          date,
          time,
          dateValue:   now2,
        });

        // Clear balance and mark expired
        wallet.balance          = 0;
        wallet.isExpired        = true;
        wallet.totalWithdrawn  += expiredAmount;
        await wallet.save();

        console.log(`✅ Expired wallet for user ${wallet.user} — ₹${expiredAmount} transferred`);
      }

      console.log(`⏰ Wallet expiry check done. Processed: ${expiredWallets.length} wallets`);
    } catch (err) {
      console.error("Wallet expiry cron error:", err);
    }
  });
};

export default startWalletExpiryCron;