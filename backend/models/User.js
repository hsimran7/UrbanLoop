const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['CITIZEN', 'WORKER', 'SUPERVISOR', 'FACILITY_MANAGER', 'GOVERNMENT_OFFICIAL', 'SYSTEM_ADMIN'],
    default: 'CITIZEN',
  },
  status: {
    type: String,
    enum: ['PENDING', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED'],
    default: 'PENDING',
  },
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING',
  },
  isActive: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  verificationTokenHash: { type: String, default: null, sparse: true },
  verificationTokenExpires: { type: Date, default: null },
  passwordResetTokenHash: { type: String, default: null, sparse: true },
  passwordResetExpires: { type: Date, default: null },
  name: { type: String },
  phone: { type: String },
}, {
  timestamps: true,
});

userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);