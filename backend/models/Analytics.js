const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, default: 'ACTIVE' },
  parentDepartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  memberships: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    membershipRole: { type: String },
    status: { type: String, default: 'ACTIVE' },
    effectiveFrom: { type: Date },
    effectiveUntil: { type: Date, default: null },
  }],
}, { timestamps: true });

const analyticsSnapshotSchema = new mongoose.Schema({
  kpiKey: { type: String, required: true },
  kpiValue: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});
analyticsSnapshotSchema.index({ kpiKey: 1, timestamp: -1 });

const kpiMetricSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, required: true },
  description: { type: String, default: null },
}, { timestamps: { createdAt: false, updatedAt: true } });

const fleetNotificationSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  type: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, required: true },
  isRead: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = {
  Department: mongoose.model('Department', departmentSchema),
  AnalyticsSnapshot: mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema),
  KPIMetric: mongoose.model('KPIMetric', kpiMetricSchema),
  FleetNotification: mongoose.model('FleetNotification', fleetNotificationSchema),
};
