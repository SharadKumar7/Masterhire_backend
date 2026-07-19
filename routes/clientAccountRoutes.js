import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import * as ctrl from "../controllers/clientAccountControllers.js";

const router = express.Router();

// All routes require valid JWT + client role
router.use(protect);

// Profile
router.get("/me", ctrl.getProfile);

// Personal Details
// ✅ uploadProfilePhoto (multer) runs first — parses multipart/form-data,
// puts text fields on req.body and the file (if any) on req.file
router.patch("/personal", ctrl.uploadProfilePhoto, ctrl.updatePersonal);

// Hiring Preferences
router.patch("/hiring-preferences", ctrl.updateHiringPreferences);

// Billing & Payments
router.patch("/upi",             ctrl.updateUPI);
router.patch("/payment-method",  ctrl.updatePaymentMethod);
router.patch("/billing-address", ctrl.updateBillingAddress);
router.get("/invoices/:invoiceId/download", ctrl.downloadInvoice);

// Notifications
router.patch("/notifications", ctrl.updateNotifications);

// Security
router.patch("/change-password", ctrl.changePassword);
router.post("/logout-all",       ctrl.logoutAllDevices);

// Account Deletion
router.post("/send-delete-otp", ctrl.sendDeleteOTP);
router.delete("/delete",        ctrl.deleteAccount);

export default router;