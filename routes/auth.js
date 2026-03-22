const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const { authenticate } = require("../middleware/authMiddleware");

// Setup Nodemailer transporter (Fallback to dummy output if not configured)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT), // Ensure it's a number 587
  secure: false, // Must be FALSE for port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false // Helps bypass local network security blocks
  }
});
// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT
    const payload = {
      id: user._id,
      role: user.role,
      email: user.email,
      name: user.name
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "default_secret_key",
      { expiresIn: "1d" } // Token expires in 1 day
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/change-password
router.post("/change-password", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Old and new passwords are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect old password" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) {
      // Don't leak whether user exists or not
      return res.json({ message: "If that email exists, an OTP has been sent." });
    }

    // Generate 6 digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    user.resetOtp = otp;
    user.resetOtpExpiry = expiry;
    await user.save();

    // Standard email text
    const mailOptions = {
      from: '"AcademiX Support" <avidubey008@gmail.com>',
      to: user.email,
      subject: "Password Reset OTP - AcademiX",
      text: `Your password reset OTP is: ${otp}. It will expire in 15 minutes.`
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (mailError) {
      console.error("Mail send error (logging OTP to console instead):", otp, mailError.message);
    }

    res.json({ message: "If that email exists, an OTP has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, OTP, and new password are required." });
    }

    const user = await User.findOne({ email });
    if (!user || user.resetOtp !== otp || !user.resetOtpExpiry || user.resetOtpExpiry < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.resetOtp = undefined;
    user.resetOtpExpiry = undefined;
    await user.save();

    res.json({ message: "Password reset successful. You can now login." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
