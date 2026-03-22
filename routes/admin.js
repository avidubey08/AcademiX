const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");

// Apply authentication and authorization for all routes in this file
router.use(authenticate, authorizeRoles("admin"));

// Helper to create users
const createUser = async (req, res, role) => {
  try {
    const { name, email, password, department, rollNo, subjects, classTimings, faceDescriptor } = req.body;

    if (!name || !email || !password || !department) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "User with this email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const normalizedSubjects = Array.isArray(subjects)
      ? subjects.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const normalizedTimings = Array.isArray(classTimings)
      ? classTimings.map((t) => String(t).trim()).filter(Boolean)
      : [];

    const validDescriptor = Array.isArray(faceDescriptor)
      && faceDescriptor.length === 128
      && faceDescriptor.every((v) => typeof v === "number" && Number.isFinite(v));

    if (role === "student") {
      if (!rollNo) {
        return res.status(400).json({ error: "Roll number is required for students." });
      }
      if (!validDescriptor) {
        return res.status(400).json({ error: "A valid 128-d face descriptor is required for students." });
      }
    }

    if (role === "professor" && normalizedSubjects.length === 0) {
      return res.status(400).json({ error: "At least one subject is required for professors." });
    }

    const newUser = new User({
      role,
      name,
      email,
      password: hashedPassword,
      department,
      rollNo: role === "student" ? rollNo : undefined,
      professorProfile: role === "professor" ? { subjects: normalizedSubjects, classTimings: normalizedTimings } : undefined,
      faceDescriptor: role === "student" ? faceDescriptor : []
    });

    await newUser.save();

    res.status(201).json({ 
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully!`,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error(`Error creating ${role}:`, error);
    res.status(500).json({ error: "Internal server error." });
  }
};

// POST /api/admin/professor
router.post("/professor", async (req, res) => {
  await createUser(req, res, "professor");
});

// POST /api/admin/student
router.post("/student", async (req, res) => {
  await createUser(req, res, "student");
});
// ==========================================
// NEW: MANAGE USERS (READ, UPDATE, DELETE)
// ==========================================

// 1. GET /api/admin/users
// Fetch all students and professors so the admin can see them in a table
router.get("/users", async (req, res) => {
  try {
    // Find everyone who is NOT an admin, and exclude their passwords
    const users = await User.find({ role: { $ne: "admin" } }).select("-password");
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// 2. DELETE /api/admin/users/:id
// Delete a specific user by their database ID
router.delete("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent the admin from accidentally deleting themselves!
    const userToDelete = await User.findById(userId);
    if (!userToDelete) return res.status(404).json({ error: "User not found." });
    if (userToDelete.role === "admin") {
      return res.status(403).json({ error: "Cannot delete an admin account." });
    }

    await User.findByIdAndDelete(userId);
    
    // Optional: Also delete all attendance records associated with this student
    if (userToDelete.role === "student") {
      const Attendance = require("../models/Attendance");
      await Attendance.deleteMany({ studentId: userId });
    }

    res.json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// 3. PUT /api/admin/users/:id
// Edit a specific user's details
// 3. PUT /api/admin/users/:id
router.put("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, department, subjects, rollNo } = req.body;

    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) return res.status(404).json({ error: "User not found." });

    // Update the common fields
    userToUpdate.name = name;
    userToUpdate.email = email;
    userToUpdate.department = department;

    // Update role-specific fields safely
    if (userToUpdate.role === "professor" && subjects !== undefined) {
      userToUpdate.professorProfile.subjects = subjects.split(",").map(s => s.trim()).filter(Boolean);
    }
    
    if (userToUpdate.role === "student" && rollNo !== undefined) {
      userToUpdate.rollNo = rollNo;
    }

    await userToUpdate.save(); // This validates and saves everything securely
    res.json({ message: "User updated successfully.", user: userToUpdate });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});
module.exports = router;
