import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // 🔹 BASIC INFO (COMMON)
    firstName: String,
    lastName: String,
    country: String,

    email: {
      type: String,
      required: true,
      unique: true,
    },

    googleId: {
  type: String,
  default: null,
},

    password: {
  type: String,
  default: null,
},

    role: {
      type: String,
      enum: ["freelancer", "client"],
      required: true,
    },

    // 🔐 OTP
    otp: String,
    otpExpiry: Date,

    isVerified: {
      type: Boolean,
      default: false,
    },

    // ✅ ADDED: for account deletion OTP (separate from signup OTP)
    deleteOtp: { type: String, default: null },
    deleteOtpExpiry: { type: Date, default: null },

    // ✅ ADDED: increment this to invalidate all existing JWT tokens (logout-all-devices)
    tokenVersion: { type: Number, default: 0 },

    // 👤 PERSONAL
    photo: String,
    dob: Date,
    gender: String,
    mobile: String,

    address: {
      streetAddress: String,
      city: String,
      state: String,
      zip: String,
    },

    // 🌐 LAST SEEN (COMMON)
    lastSeen: {
      type: Date,
      default: Date.now,
    },

    // 🔥 DOMAIN (MAIN + SUBDOMAIN)
    domains: [
      {
        name: String,
        subDomains: [String],
      },
    ],

    // 🔧 SKILLS
    skills: [String],
    title: String,
    bio: String,

    // 📊 EXPERIENCE / EDUCATION
    experiences: [
      {
        title: String,
        company: String,
        startDate: Date,
        endDate: Date,
        description: String,
      },
    ],

    education: [
      {
        institution: String,
        degree: String,
        passingYear: String,
        fieldOfStudy: String,
        description: String,
      },
    ],

    languages: [
      {
        language: String,
        proficiency: String,
      },
    ],

    isProfileComplete: {
      type: Boolean,
      default: false,
    },

    lastSignIn: {
      type: Date,
    },

    // =====================================================
    // 🧑‍💻 FREELANCER SECTION
    // =====================================================
    freelancer: {
      experienceLevel: {
        type: String,
        enum: ["Entry", "Intermediate", "Expert"],
      },

      rating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
      jobSuccess: { type: Number, default: 0 },
      totalProjects: { type: Number, default: 0 },
      completedProjects: { type: Number, default: 0 },
      activeProjects: { type: Number, default: 0 },

      savedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],
      appliedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],

      isEarningsPrivate: { type: Boolean, default: true },
      earnings: { type: Number, default: 0 },
      currentBalance: { type: Number, default: 0 },
      upi_id: { type: String, trim: true },

      isAvailable: { type: Boolean, default: true },
      visibility: { type: String, enum: ["Public", "Private"], default: "Public" },
      consultation: { type: Boolean, default: false },
      responseTime: String,

      notifications: {
        jobRecommendations: { type: Boolean, default: true },
        applicationUpdates: { type: Boolean, default: true },
        interviewReminders: { type: Boolean, default: true },
        paymentReceived: { type: Boolean, default: true },
        withdrawalStatus: { type: Boolean, default: true },
        invoiceGenerated: { type: Boolean, default: false },
        messageReceived: { type: Boolean, default: true },
        unreadReminders: { type: Boolean, default: false },
        newDeviceLogin: { type: Boolean, default: true },
        passwordChange: { type: Boolean, default: true },
      },

      portfolio: [
        {
          title: String,
          description: String,
          link: String,
        },
      ],
    },

    // =====================================================
    // 🏢 CLIENT SECTION
    // =====================================================
    client: {
      companyName: String,
      companyDetails: String,

      postedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],

      totalHires: { type: Number, default: 0 },
      activeJobs: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      rating: { type: Number, default: 0 },

      // ✅ ADDED: Hiring Preferences
      freelancerLevel: {
        type: String,
        enum: ["Beginner", "Intermediate", "Expert", ""],
        default: "",
      },
      budgetRange: { type: String, default: "" },
      communicationPreference: {
        type: String,
        enum: ["Chat", "Video Call", "Email", ""],
        default: "",
      },
      autoInviteFreelancers: { type: Boolean, default: false },
      jobVisibility: {
        type: String,
        enum: ["Public", "Private", "Invite Only"],
        default: "Public",
      },

      // ✅ ADDED: Billing & Payments
      walletBalance: { type: Number, default: 0 },
      paymentMethod: { type: String, default: "" },
      upi_id: { type: String, default: "" },
      billingAddress: { type: String, default: "" },

      paymentHistory: [
        {
          amount: { type: Number, required: true },
          date: { type: Date, default: Date.now },
          status: { type: String, enum: ["Success", "Pending", "Failed"], default: "Pending" },
          description: { type: String, default: "" },
        },
      ],

      invoices: [
        {
          invoiceNumber: { type: String, required: true },
          amount: { type: Number, required: true },
          date: { type: Date, default: Date.now },
          status: { type: String, enum: ["Paid", "Unpaid"], default: "Unpaid" },
          fileUrl: { type: String, default: "" },
        },
      ],

      // ✅ ADDED: Client Notifications
      notifications: {
        proposalReceived:   { type: Boolean, default: true },
        hiringUpdates:      { type: Boolean, default: true },
        interviewReminders: { type: Boolean, default: true },
        messageReceived:    { type: Boolean, default: true },
        paymentAlerts:      { type: Boolean, default: true },
        marketingEmails:    { type: Boolean, default: false },
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);