const mongoose = require('mongoose');

const smartBinSchema = new mongoose.Schema({
  municipalityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Municipality', required: true },
  qrCode: { type: String, unique: true, required: true },
  rfid: { type: String, unique: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  ward: { type: String, required: true },
  zone: { type: String },
  collectionPoint: { type: String },
  capacity: { type: Number, required: true }, // in kg or liters
  currentFillLevel: { type: Number, default: 0 }, // 0 to 100 percentage
  batteryStatus: { type: Number, default: 100 }, // 0 to 100 percentage
  sensorStatus: { type: String, enum: ['online', 'offline', 'error'], default: 'offline' },
  binType: { type: String, enum: ['wet', 'dry', 'plastic', 'medical', 'ewaste'], required: true },
  isOverflowing: { type: Boolean, default: false },
  fireAlert: { type: Boolean, default: false },
  tamperDetected: { type: Boolean, default: false },
  lastCollectionTime: { type: Date },
  lastMaintenance: { type: Date },
  assignedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  health: { type: String, enum: ['good', 'needs_maintenance', 'damaged'], default: 'good' },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

smartBinSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('SmartBin', smartBinSchema);
