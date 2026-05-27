import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import path from "path";                          // ← ADD
import { fileURLToPath } from "url";              // ← ADD
import { Server as SocketIO } from "socket.io";

import authRoutes from "./routes/authRoutes.js";
import connectDB from "./config/db.js";
import jobRoutes from "./routes/jobRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import freelancerAccountRoutes from "./routes/freelancerAccountRoutes.js";
import clientAccountRoutes from "./routes/clientAccountRoutes.js";
import clientWorkspaceRoute from "./routes/clientWorkspaceRoutes.js";
import initSocket from "./socket/index.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);  // ← ADD
const __dirname  = path.dirname(__filename);         // ← ADD

const app    = express();
const server = http.createServer(app);

const io = new SocketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  },
});

initSocket(io);

const allowedOrigins = [
  "http://localhost:5173",
  "https://masterhire.netlify.app",
  "https://masterhirebackend-production.up.railway.app",
];

app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],  // ← OPTIONS add kiya
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());  // ← yeh add karo

// ── Static uploads ───────────────────────────────────────────── ← ADD
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

connectDB();

app.use("/api/auth",                authRoutes);
app.use("/api/jobs",                jobRoutes);
app.use("/api/users",               userRoutes);
app.use("/api",                     notificationRoutes);
app.use("/api",                     profileRoutes);
app.use("/api",                     applicationRoutes);
app.use("/api/freelancer/settings", freelancerAccountRoutes);
app.use("/api/client/settings",     clientAccountRoutes);
app.use("/workspace/api",           clientWorkspaceRoute);

app.get("/", (req, res) => res.send("API is running"));

const PORT = process.env.PORT || 5006;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));