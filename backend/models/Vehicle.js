const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  municipalityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Municipality', required: true },
  registrationNumber: { type: String, required: true, unique: true },
  qrCode: { type: String, unique: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Assigned Worker
  capacity: { type: Number, required: true }, // in kg or liters
  fuelCapacity: { type: Number },
  currentFuelLevel: { type: Number }, // percentage
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
  },
  currentRoute: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  maintenanceSchedule: { type: Date },
  iotDeviceId: { type: String, unique: true, sparse: true },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'maintenance', 'out_of_service'],
    default: 'active'
  },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

vehicleSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Vehicle', vehicleSchema);