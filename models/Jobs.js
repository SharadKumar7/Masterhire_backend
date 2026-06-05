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

    status: {
      type:    String,
      enum:    ["pending", "in progress", "submitted", "approved", "changes_requested"],
      default: "pending",
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
    isPaid:   { type: Boolean, default: false },
    paidAt:   { type: Date,    default: null },
    paidAmount: { type: Number, default: 0 },

    // Client review note
    reviewNote: { type: String, default: "" },
  },
  { timestamps: true }
);

// ─── File Sub-Schema ──────────────────────────────────────────────────────────
const fileSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  url:         { type: String, required: true },
  size:        { type: String, default: "" },
  fileType:    { type: String, default: "document" }, // "image" | "video" | "document"
  uploadedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploaderRole:{ type: String, enum: ["client", "freelancer"], default: "client" },
  source:      { type: String, enum: ["client", "milestone"], default: "client" },
  milestoneId: { type: mongoose.Schema.Types.ObjectId, default: null }, // if from milestone
  uploadedAt:  { type: Date, default: Date.now },
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

    isPublic:   { type: Boolean, default: true },
    proposals:  { type: Number,  default: 0 },
    postedTime: { type: Date,    default: Date.now },

    // ── NEW: Milestones ──────────────────────────────────────────────────────
    milestones: [milestoneSchema],

    // ── NEW: All files (client-uploaded + milestone-submitted mirror) ────────
    files: [fileSchema],

    // ── NEW: Activity log ────────────────────────────────────────────────────
    activityLog: [activitySchema],

    // ── NEW: Project start date (set when freelancer is assigned) ────────────
    startedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Job", jobSchema);