const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");

// POST /api/attendance/log
router.post("/log", authenticate, authorizeRoles("professor"), async (req, res) => {
  try {
    const { studentId, subject } = req.body;
    const professorId = req.user.id;

    if (!studentId || !subject) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Cooldown check (prevent duplicate logs within 1 hour for the same subject)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await Attendance.findOne({
      studentId,
      subject,
      timestamp: { $gte: oneHourAgo }
    });

    if (recent) {
      return res.status(400).json({ error: "Attendance already logged recently for this subject." });
    }

    const record = new Attendance({
      studentId,
      professorId,
      subject
    });
    
    await record.save();

    // Trigger Socket.io realtime ping to the student individually
    const io = req.app.get("io");
    if (io) {
      io.to(`student:${studentId}`).emit("attendance_logged", {
        studentId,
        subject,
        at: record.timestamp,
      });
    }

    res.json({
      success: true,
      message: "Attendance logged successfully",
      timestamp: record.timestamp
    });

  } catch (error) {
    console.error("Attendance Log Error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/attendance/my
// Get logged in student's attendance records
router.get("/my", authenticate, authorizeRoles("student"), async (req, res) => {
  try {
    const records = await Attendance.find({ studentId: req.user.id })
      .populate("professorId", "name")
      .sort({ timestamp: -1 });
    
    // Formatting the response
    const formattedRecords = records.map(record => ({
      _id: record._id,
      subject: record.subject,
      professorName: record.professorId ? record.professorId.name : "Unknown",
      timestamp: record.timestamp
    }));

    res.json(formattedRecords);
  } catch (error) {
    console.error("Fetch Attendance Error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});
// GET /api/attendance/stats
// Calculates attendance percentage per subject for the logged-in student
router.get("/stats", authenticate, authorizeRoles("student"), async (req, res) => {
  try {
    const studentObjectId = new mongoose.Types.ObjectId(req.user.id);

    // Step 1: Find total classes HELD per subject
    // We do this by counting unique days attendance was logged for each subject
    const totalClassesData = await Attendance.aggregate([
      {
        $group: {
          _id: {
            subject: "$subject",
            // Group by Year-Month-Day to count 1 session per day
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
          }
        }
      },
      {
        $group: {
          _id: "$_id.subject",
          totalSessions: { $sum: 1 }
        }
      }
    ]);

    // Step 2: Find total classes ATTENDED by this specific student per subject
    const studentAttendanceData = await Attendance.aggregate([
      { $match: { studentId: studentObjectId } },
      {
        $group: {
          _id: "$subject",
          attendedSessions: { $sum: 1 }
        }
      }
    ]);

    // Step 3: Merge the data and calculate percentages
    const stats = totalClassesData.map(totalData => {
      const subject = totalData._id;
      const total = totalData.totalSessions;
      
      // Find matching student attendance, default to 0 if they missed all classes
      const studentData = studentAttendanceData.find(s => s._id === subject);
      const attended = studentData ? studentData.attendedSessions : 0;
      
      const percentage = total > 0 ? ((attended / total) * 100).toFixed(1) : 0;

      return {
        subject,
        attended,
        total,
        percentage: parseFloat(percentage)
      };
    });

    res.json(stats);
  } catch (error) {
    console.error("Stats Error:", error);
    res.status(500).json({ error: "Failed to calculate attendance stats." });
  }
});
// GET /api/attendance/class-stats
// For professors to see attendance % of all students in a subject
router.get("/class-stats", authenticate, authorizeRoles("professor"), async (req, res) => {
  try {
    const { subject, department } = req.query;
    
    if (!subject || !department) {
      return res.status(400).json({ error: "Subject and Department are required." });
    }

    const professorObjectId = new mongoose.Types.ObjectId(req.user.id);
    const User = require("../models/User"); // Need this to find the students

    // 1. Find total unique days this professor taught this subject
    const totalClassesData = await Attendance.aggregate([
      { $match: { professorId: professorObjectId, subject: subject } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } } } },
      { $count: "totalSessions" }
    ]);
    
    const totalSessions = totalClassesData.length > 0 ? totalClassesData[0].totalSessions : 0;

    // 2. Get ALL students in that department (even if they have 0 attendance)
    const escapedDept = department.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const students = await User.find({ 
      role: "student", 
      department: new RegExp(`^${escapedDept}$`, "i") 
    }).select("_id name rollNo");

    // 3. Find how many times each student attended this specific subject
    const attendanceRecords = await Attendance.aggregate([
      { $match: { professorId: professorObjectId, subject: subject } },
      { $group: { _id: "$studentId", attended: { $sum: 1 } } }
    ]);

    // 4. Merge the data and calculate the math
    const stats = students.map(student => {
      // Find this student's attendance record (if it exists)
      const record = attendanceRecords.find(r => r._id.equals(student._id));
      const attended = record ? record.attended : 0;
      const percentage = totalSessions > 0 ? ((attended / totalSessions) * 100).toFixed(1) : 0;

      return {
        rollNo: student.rollNo || "N/A",
        name: student.name,
        attended,
        percentage: parseFloat(percentage)
      };
    });

    // Sort by Roll Number so the table looks organized
    stats.sort((a, b) => a.rollNo - b.rollNo);

    res.json({ totalSessions, students: stats });

  } catch (error) {
    console.error("Class Stats Error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});
module.exports = router;
