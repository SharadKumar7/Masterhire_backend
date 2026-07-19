import mongoose from "mongoose";

// ─── Milestone Sub-Schema ─────────────────────────────────────────────────────
const milestoneSchema = new mongoose.Schema(
  {
    title:        { type: String, required: true },
    description:  { type: String, default: "" },
    budget:       { type: Number, required: true },
    duration:     { type: String, default: "" },        // "1_week", "2_weeks" etc.
    dueDate:      { type: Date,   required: true },
    deliverables: { type: String, default: "" },

    // ✅ FIX: "pending" renamed to "pending_approval" — new milestones now wait
    // for client approval before the freelancer can submit work. "rejected"
    // added for milestones the client declines at the proposal stage.
    status: {
      type:    String,
      enum:    ["pending_approval", "in progress", "submitted", "approved", "changes_requested", "rejected"],
      default: "pending_approval",
    },

    submittedOn: { type: Date, default: null },

    // Files freelancer submits for this milestone
    submittedFiles: [
      {
        name:        String,
        url:         String,
        size:        String,
        fileType:    String,
        uploadedAt:  { type: Date, default: Date.now },
      },
    ],

    // Payment
    isPaid:     { type: Boolean, default: false },
    paidAt:     { type: Date,    default: null },
    paidAmount: { type: Number,  default: 0 },
    escrowStatus: {
      type:    String,
      enum:    ["pending", "held", "released", "refunded"],
      default: "pending",
    },
    razorpayOrderId:   { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },

    // ✅ NEW — client-side charge breakdown, captured at payment time so
    // approval/refund/release logic never has to recompute fee/GST later.
    clientPlatformFee: { type: Number, default: 0 }, // 5% of milestone budget, charged to client
    clientGST:          { type: Number, default: 0 }, // 18% GST on clientPlatformFee
    clientTotalPaid:    { type: Number, default: 0 }, // budget + clientPlatformFee + clientGST

    // Client review note
    reviewNote: { type: String, default: "" },
  },
  { timestamps: true }
);

// ─── File Sub-Schema ──────────────────────────────────────────────────────────
const fileSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  url:          { type: String, required: true },
  size:         { type: String, default: "" },
  fileType:     { type: String, default: "document" }, // "image" | "video" | "document"
  uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploaderRole: { type: String, enum: ["client", "freelancer"], default: "client" },
  source:       { type: String, enum: ["client", "milestone"], default: "client" },
  milestoneId:  { type: mongoose.Schema.Types.ObjectId, default: null }, // if from milestone
  uploadedAt:   { type: Date, default: Date.now },
});

// ─── Activity Log Sub-Schema ──────────────────────────────────────────────────
const activitySchema = new mongoose.Schema({
  label:     { type: String, required: true },
  meta:      { type: String, default: "" },
  primary:   { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// ─── Main Job Schema ──────────────────────────────────────────────────────────
const jobSchema = new mongoose.Schema(
  {
    jobId: { type: String, unique: true },

    title:           { type: String, required: true },
    description:     { type: String, required: true },
    budget:          Number,
    skills:          [String],
    experienceLevel: String,
    deadline:        String,

    visibility: {
      type:    String,
      enum:    ["Public", "invite-only"],
      default: "Public",
    },

    allowNegotiation: Boolean,

    clientId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    status: {
      type:    String,
      enum:    ["draft", "published", "assigned"],
      default: "draft",
    },

    assignedFreelancer: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    // ✅ NEW — direct link to the accepted HiredContract. Set once when the
    // application is accepted (see applicationController.js). Replaces the
    // fragile client+freelancer+jobTitle lookup that could match the wrong
    // contract when a client hires the same freelancer more than once.
    hiredContract: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "HiredContract",
      default: null,
    },

    isPublic:   { type: Boolean, default: true },
    proposals:  { type: Number,  default: 0 },
    postedTime: { type: Date,    default: Date.now },

    // ── Milestones ────────────────────────────────────────────────────────────
    milestones: [milestoneSchema],

    // ── All files (client-uploaded + milestone-submitted mirror) ─────────────
    files: [fileSchema],

    // ── Activity log ──────────────────────────────────────────────────────────
    activityLog: [activitySchema],

    // ── Project start date (set when freelancer is assigned) ─────────────────
    startedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Job", jobSchema);