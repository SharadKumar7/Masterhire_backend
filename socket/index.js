import jwt from "jsonwebtoken";

const onlineUsers = new Map();
const callTimers  = new Map();

const initSocket = (io) => {

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId || decoded._id; // ✅ both supported
      socket.role   = decoded.role;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.userId;
    onlineUsers.set(userId, socket.id);
    console.log(`🟢 Connected: ${userId}`);

    socket.on("join_room", (jobId) => socket.join(jobId));

    // ── Messages ──────────────────────────────────────────────────────────────
    socket.on("new_message", ({ jobId, message }) => {
      socket.to(jobId).emit("receive_message", message);
    });

    socket.on("typing", ({ jobId, name }) => {
      socket.to(jobId).emit("user_typing", { name });
    });

    socket.on("stop_typing", ({ jobId }) => {
      socket.to(jobId).emit("user_stop_typing");
    });

    // ── Call User ─────────────────────────────────────────────────────────────
    socket.on("call_user", ({ to, offer, callType, callerName, jobId, receiverId }) => {
      console.log("call_user received, to:", to);
  console.log("onlineUsers keys:", [...onlineUsers.keys()]);
      const receiverSocket = onlineUsers.get(to);
      console.log("receiverSocket:", receiverSocket);
      console.log(`📞 call_user: from=${userId} to=${to} found=${!!receiverSocket}`);

      if (receiverSocket) {
        io.to(receiverSocket).emit("incoming_call", {
          from: userId, offer, callType, callerName, jobId, receiverId,
        });

        // Auto-cut after 60 seconds
        const callId = `${userId}-${to}`;
        const timer  = setTimeout(() => {
          const callerSocket = onlineUsers.get(userId);
          if (callerSocket) io.to(callerSocket).emit("call_missed", { to, callType });
          io.to(receiverSocket).emit("call_missed", { from: userId, callType });
          callTimers.delete(callId);
        }, 60000);

        callTimers.set(callId, timer);
      } else {
        // Receiver offline
        socket.emit("call_missed", { to, callType, offline: true });
      }
    });

    // ── Call Answered — clear auto-cut timer ──────────────────────────────────
    socket.on("call_answer", ({ to, answer }) => {
      const receiverSocket = onlineUsers.get(to);
      if (receiverSocket) io.to(receiverSocket).emit("call_answered", { answer });

      const callId = `${to}-${userId}`;
      if (callTimers.has(callId)) {
        clearTimeout(callTimers.get(callId));
        callTimers.delete(callId);
      }
    });

    // ── ICE Candidate ─────────────────────────────────────────────────────────
    socket.on("ice_candidate", ({ to, candidate }) => {
      const receiverSocket = onlineUsers.get(to);
      if (receiverSocket) io.to(receiverSocket).emit("ice_candidate", { candidate });
    });

    // ── End Call ──────────────────────────────────────────────────────────────
    socket.on("end_call", ({ to }) => {
      const receiverSocket = onlineUsers.get(to);
      if (receiverSocket) io.to(receiverSocket).emit("call_ended");
      [`${userId}-${to}`, `${to}-${userId}`].forEach(id => {
        if (callTimers.has(id)) { clearTimeout(callTimers.get(id)); callTimers.delete(id); }
      });
    });

    // ── Screen Share ──────────────────────────────────────────────────────────
    socket.on("screen_share_started", ({ to }) => {
      const s = onlineUsers.get(to);
      if (s) io.to(s).emit("screen_share_started");
    });

    socket.on("screen_share_stopped", ({ to }) => {
      const s = onlineUsers.get(to);
      if (s) io.to(s).emit("screen_share_stopped");
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      console.log(`🔴 Disconnected: ${userId}`);
    });
  });
};

export default initSocket;