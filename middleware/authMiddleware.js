import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, access denied sharad" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id || decoded.userId).select(
      "+tokenVersion",
    );
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // tokenVersion check
    const dbVersion = user.tokenVersion ?? 0;
    const tokenVersion = decoded.tokenVersion ?? 0;
    if (tokenVersion !== dbVersion) {
      return res
        .status(401)
        .json({ message: "Session expired. Please login again." });
    }

    req.user = user;
    req.user._id = user._id;
    req.user.userId = user._id; // ✅ dono same rakho
    req.user.id = user._id; // ← backward compatibility for old controllers

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
