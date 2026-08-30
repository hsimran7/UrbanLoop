const mongoose = require('mongoose');

const binSchema = new mongoose.Schema({
  qrCodeId: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['DRY', 'WET', 'E_WASTE', 'RECYCLABLES', 'HAZARDOUS', 'BULK', 'OTHER'],
    required: true,
  },
  status: {
    type: String,
    enum: ['EMPTY', 'FULL', 'OVERFLOWING', 'UNDER_MAINTENANCE'],
    default: 'EMPTY',
  },
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'VERIFIED',
  },
  condition: {
    type: String,
    enum: ['GOOD', 'DAMAGED', 'NEEDS_REPLACEMENT'],
    default: 'GOOD',
  },
  collectionPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionPoint', required: true },
  currentFillLevel: { type: Number, default: 0, min: 0, max: 100 },
  lastTelemetryAt: { type: Date, default: null },
  telemetryStatus: {
    type: String,
    enum: ['ONLINE', 'STALE', 'OFFLINE', 'NEVER_CONNECTED'],
    default: 'NEVER_CONNECTED',
  },
  lastEmptiedAt: { type: Date, default: null },
}, { timestamps: true });

binSchema.index({ collectionPointId: 1 });
binSchema.index({ currentFillLevel: 1 });
binSchema.index({ telemetryStatus: 1 });
binSchema.index({ status: 1 });

module.exports = mongoose.model('Bin', binSchema);
