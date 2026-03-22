const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['admin', 'professor', 'student'],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  rollNo: {
    type: String,
    unique: true,
    sparse: true, // Useful since admin/professors might not have roll numbers
    required: function() { 
      return this.role === 'student'; 
    }
  },
  professorProfile: {
    subjects: { type: [String], default: [] },
    classTimings: { type: [String], default: [] }
  },
  faceDescriptor: {
    type: [Number], // Array of Numbers for future AI integration (face encoding)
    default: []
  },
  resetOtp: {
    type: String
  },
  resetOtpExpiry: {
    type: Date
  }
}, { timestamps: true });
userSchema.set('autoIndex', true);

module.exports = mongoose.model('User', userSchema);
