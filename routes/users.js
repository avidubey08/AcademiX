const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");

// GET /api/users/students
// For professors to fetch eligible students and their face descriptors ONLY for specific department
router.get("/students", authenticate, authorizeRoles("admin", "professor"), async (req, res) => {
  try {
    const department = String(req.query.department || "").trim();

    if (!department) {
      return res.status(400).json({ error: "Department is required." });
    }
    
    // Base query: Student role with valid face descriptors
    const query = {
      role: "student",
      faceDescriptor: { $exists: true, $not: { $size: 0 } }
    };

    // Filter strictly by department (required to optimize pre-loading per architecture docs)
    const escapedDepartment = department.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.department = new RegExp(`^${escapedDepartment}$`, "i");

    const students = await User.find(query).select("_id name rollNo department faceDescriptor");
    
    res.json(students);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
