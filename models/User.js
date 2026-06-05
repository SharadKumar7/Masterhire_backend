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

    deleteOtp: { type: String, default: null },
    deleteOtpExpiry: { type: Date, default: null },

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

    // 🌐 LAST SEEN
    lastSeen: {
      type: Date,
      default: Date.now,
    },

    // 🔥 DOMAIN
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
        startDate: String,
        endDate: String,
        current: { type: Boolean, default: false },
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

    // ✅ NEW: Certifications
    certifications: [
      {
        name: String,
        issuer: String,
        issueDate: String,
        expiryDate: String,
        noExpiry: { type: Boolean, default: false },
        credentialUrl: { type: String, default: "" },
      },
    ],

    // ✅ NEW: Other Experiences
    otherExperiences: [
      {
        title: String,
        type: {
          type: String,
          enum: ["Volunteer", "Freelance Project", "Open Source", "Hackathon", "Award", "Publication", "Other"],
          default: "Other",
        },
        organization: String,
        year: String,
        description: String,
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
      visibility: {
        type: String,
        enum: ["Public", "Private"],
        default: "Public",
      },
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
      companyName:    { type: String, default: "" },
      companyDetails: { type: String, default: "" },

      // ✅ NEW: Profile fields
      about:       { type: String, default: "" },
      industry:    { type: String, default: "" },
      companySize: { type: String, default: "" },
      website:     { type: String, default: "" },

      // ✅ NEW: Verification
      isEmailVerified:   { type: Boolean, default: false },
      isPaymentVerified: { type: Boolean, default: false },

      postedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],

      totalHires:        { type: Number, default: 0 },
      activeJobs:        { type: Number, default: 0 },
      totalSpent:        { type: Number, default: 0 },
      projectsCompleted: { type: Number, default: 0 },
      repeatHires:       { type: Number, default: 0 },
      rating:            { type: Number, default: 0 },
      totalReviews:      { type: Number, default: 0 },

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

      walletBalance:  { type: Number, default: 0 },
      upi_id:         { type: String, default: "" },
      billingAddress: { type: String, default: "" },

      // ✅ UPDATED: paymentMethod as object
      paymentMethod: {
        type:   { type: String, default: "" },
        last4:  { type: String, default: "" },
        expiry: { type: String, default: "" },
      },

      paymentHistory: [
        {
          amount: { type: Number, required: true },
          date: { type: Date, default: Date.now },
          status: {
            type: String,
            enum: ["Success", "Pending", "Failed"],
            default: "Pending",
          },
          description: { type: String, default: "" },
        },
      ],

      invoices: [
        {
          invoiceNumber: { type: String, required: true },
          amount:        { type: Number, required: true },
          date:          { type: Date, default: Date.now },
          status:        { type: String, enum: ["Paid", "Unpaid"], default: "Unpaid" },
          fileUrl:       { type: String, default: "" },
        },
      ],

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
  { timestamps: true },
);

export default mongoose.model("User", userSchema);