import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
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
import transactionRoutes from "./routes/transactionRoutes.js";
import projectHistoryRoutes from "./routes/projectHistoryRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import startWalletExpiryCron from "./utils/walletExpiryCron.js";


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app    = express();
const server = http.createServer(app);

const io = new SocketIO(server, {
  cors: {
    origin: "*",
    credentials: false,
  },
});

initSocket(io);

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

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
app.use("/api",                     transactionRoutes);
app.use("/api",                     projectHistoryRoutes);
app.use("/api/payment", paymentRoutes);
startWalletExpiryCron();


app.get("/", (req, res) => res.send("API is running"));

const PORT = process.env.PORT || 5006;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));