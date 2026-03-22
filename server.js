const http = require("http");
const path = require("path");
//CORS (Cross-Origin Resource Sharing) is essentially a VIP guest list for your server. It is a security feature enforced by web browsers that dictates who is allowed to ask your server for data.
const cors = require("cors");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const express = require("express");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});

// Pass IO to Express routes
app.set("io", io);

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);
//Increasing the limit to 2mb is a very smart move since you are dealing with facial recognition (passing image data or large arrays of face descriptors can easily exceed the default 100kb limit).
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Static assets (Vanilla HTML/CSS/JS)
//tells Express: "If someone asks for a file in these folders (HTML, CSS, JS, or Face Models), just hand them the file directly."
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/views", express.static(path.join(__dirname, "public", "views")));
app.use("/js", express.static(path.join(__dirname, "public", "js")));
app.use("/models", express.static(path.join(__dirname, "face-models")));

// SPA-ish entry: send login as the default landing.
app.get("/", (req, res) => {
  res.redirect("/views/login.html");
});

// Routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

const userRoutes = require("./routes/users");
app.use("/api/users", userRoutes);

const adminRoutes = require("./routes/admin");
app.use("/api/admin", adminRoutes);

const attendanceRoutes = require("./routes/attendance");
app.use("/api/attendance", attendanceRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "AcademiX", time: new Date().toISOString() });
});

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/academix")
  .then(() => console.log("MongoDB connection established successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Admin seed (safe for hosting; strictly reads from env vars as required)
async function seedAdminIfEnabled() {
  if (process.env.SEED_ADMIN !== "true") return;
  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const rawPassword = process.env.SEED_ADMIN_PASSWORD || "";
  const name = process.env.SEED_ADMIN_NAME || "Admin";
  if (!email || !rawPassword) return;

  const User = require("./models/User");
  const exists = await User.findOne({ email }).select("_id").lean();
  if (exists) return;

  const salt = await bcrypt.genSalt(10);
  const password = await bcrypt.hash(rawPassword, salt);

  await User.create({
    role: "admin",
    name,
    email,
    password,
    department: "ADMIN",
  });
  console.log(`Seeded admin: ${email}`);
}

mongoose.connection.once("connected", () => {
  seedAdminIfEnabled().catch((e) => console.error("Seed admin error:", e));
});

// Socket.io: basic wiring (events will expand per module)
io.on("connection", (socket) => {
  // Client may optionally join a room (e.g., per class/session)
  socket.on("room:join", (roomId) => {
    if (typeof roomId === "string" && roomId.trim()) socket.join(roomId.trim());
  });

  // Student joins their own room: student:<id>
  socket.on("student:identify", ({ studentId }) => {
    if (typeof studentId === "string" && studentId.trim()) socket.join(`student:${studentId.trim()}`);
  });

  socket.on("disconnect", () => {
    // Keep minimal
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server (HTTP+Socket.io) running on port ${PORT}`);
});

