import Application from "../models/applicationJob.js";
import Negotiation from "../models/negotiation.js";
import { createNotification } from "./notificationController.js"; // ✅ ADD THIS

// ─── POST /api/negotiation ────────────────────────────────────────────────────
export const createNegotiation = async (req, res) => {
  try {
    const { applicationId, proposedAmount, message } = req.body;
    const clientId = req.user.userId;

    if (!applicationId || !proposedAmount) {
      return res.status(400).json({ message: "applicationId and proposedAmount are required" });
    }

    const application = await Application.findById(applicationId).populate("job");
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.job.client.toString() !== clientId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const negotiation = await Negotiation.create({
      application:    applicationId,
      job:            application.job._id,
      client:         clientId,
      freelancer:     application.user,
      proposedAmount,
      message:        message || "",
      proposedBy:     "client",
    });

    application.status    = "negotiation";
    application.bidAmount = proposedAmount;
    await application.save();

    // ✅ Freelancer ko — client ne counter offer bheja
    await createNotification({
      userId:      application.user,
      type:        "JOB_APPLIED",
      title:       "Counter Offer Received",
      message:     `Client proposed ₹${Number(proposedAmount).toLocaleString("en-IN")} for "${application.job.title}".${message ? ` Note: ${message}` : ""} Review and respond.`,
      referenceId: application.job._id,
    });

    res.status(201).json({ message: "Negotiation created successfully", negotiation });
  } catch (error) {
    console.error("createNegotiation error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── GET /api/negotiation/:applicationId ─────────────────────────────────────
export const getNegotiationHistory = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const clientId = req.user.userId;

    const application = await Application.findById(applicationId).populate("job");
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.job.client.toString() !== clientId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const history = await Negotiation.find({ application: applicationId })
      .sort({ createdAt: 1 })
      .select("proposedAmount message proposedBy status createdAt");

    res.status(200).json({ applicationId, totalRounds: history.length, history });
  } catch (error) {
    console.error("getNegotiationHistory error:", error);
    res.status(500).json({ message: "Server error" });
  }
};