// controllers/negotiationController.js
import Application from "../models/applicationJob.js";
import Negotiation from "../models/negotiation.js";

// POST /api/negotiation
export const createNegotiation = async (req, res) => {
  try {
    const { applicationId, proposedAmount, message } = req.body;
    const clientId = req.user.userId;

    if (!applicationId || !proposedAmount) {
      return res.status(400).json({ message: "applicationId and proposedAmount are required" });
    }

    // Verify application exists and client owns the job
    const application = await Application.findById(applicationId).populate("job");
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.job.client.toString() !== clientId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Create negotiation entry
    const negotiation = await Negotiation.create({
      application: applicationId,
      job: application.job._id,
      client: clientId,
      freelancer: application.user,
      proposedAmount,
      message: message || "",
      proposedBy: "client",
    });

    // Also mark application as negotiation
    application.status = "negotiation";
    application.bidAmount = proposedAmount;
    await application.save();

    res.status(201).json({
      message: "Negotiation created successfully",
      negotiation,
    });
  } catch (error) {
    console.error("createNegotiation error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/negotiation/:applicationId
export const getNegotiationHistory = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const clientId = req.user.userId;

    // Verify ownership
    const application = await Application.findById(applicationId).populate("job");
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.job.client.toString() !== clientId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const history = await Negotiation.find({ application: applicationId })
      .sort({ createdAt: 1 }) // oldest first → shows conversation flow
      .select("proposedAmount message proposedBy status createdAt");

    res.status(200).json({
      applicationId,
      totalRounds: history.length,
      history,
    });
  } catch (error) {
    console.error("getNegotiationHistory error:", error);
    res.status(500).json({ message: "Server error" });
  }
};