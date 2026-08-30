const mongoose = require('mongoose');

const binTelemetrySchema = new mongoose.Schema({
  binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', required: true },
  fillLevel: { type: Number, required: true },
  batteryLevel: { type: Number, default: null },
  temperature: { type: Number, default: null },
  signalStrength: { type: Number, default: null },
  recordedAt: { type: Date, required: true },
  receivedAt: { type: Date, default: Date.now },
  source: { type: String, enum: ['SIMULATOR', 'IOT_DEVICE', 'MANUAL_ADMIN'], required: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'IoTDevice', default: null },
  eventId: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

binTelemetrySchema.index({ binId: 1, recordedAt: -1 });

const binAlertSchema = new mongoose.Schema({
  binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', required: true },
  type: {
    type: String,
    enum: ['BIN_NEAR_FULL', 'BIN_FULL', 'BIN_OVERFLOW_RISK', 'LOW_BATTERY', 'DEVICE_STALE', 'DEVICE_OFFLINE'],
    required: true,
  },
  severity: { type: String, enum: ['INFO', 'WARNING', 'CRITICAL'], required: true },
  status: { type: String, enum: ['ACTIVE', 'RESOLVED'], required: true },
  triggeredAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
  latestValue: { type: Number, default: null },
}, { timestamps: true });

binAlertSchema.index({ binId: 1, status: 1 });

const iotDeviceSchema = new mongoose.Schema({
  deviceIdentifier: { type: String, required: true, unique: true },
  binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', required: true, unique: true },
  status: { type: String, enum: ['ACTIVE', 'DISABLED', 'REVOKED'], default: 'ACTIVE' },
  credentialHash: { type: String, required: true },
  lastSeenAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = {
  BinTelemetry: mongoose.model('BinTelemetry', binTelemetrySchema),
  BinAlert: mongoose.model('BinAlert', binAlertSchema),
  IoTDevice: mongoose.model('IoTDevice', iotDeviceSchema),
};
