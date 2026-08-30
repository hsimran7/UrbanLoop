const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true, default: 'INFO' }, // TASK_ASSIGNED, ASSIGNMENT_NEW, EMERGENCY_TASK, AREA_COMPLETED, SERVICE_REQUEST, SYSTEM, INFO, ALERT
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null }, // assignmentId, areaName, wardName, shiftName etc.
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
}, {
  timestamps: { createdAt: true, updatedAt: false },
});

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

