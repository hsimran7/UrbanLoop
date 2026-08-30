const mongoose = require('mongoose');

// Depot
const depotSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number],
  },
  vehicleCapacity: { type: Number, required: true },
  status: { type: String, default: 'ACTIVE' },
}, { timestamps: true });
depotSchema.index({ location: '2dsphere' });

// DriverProfile
const driverProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  licenseNumber: { type: String, required: true, unique: true },
  licenseExpiry: { type: Date, required: true },
  phone: { type: String, required: true },
  assignedDepotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Depot', default: null },
  assignedVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  status: { type: String, default: 'ACTIVE' },
  safetyScore: { type: Number, default: 100.0 },
}, { timestamps: true });

// Vehicle
const vehicleSchema = new mongoose.Schema({
  vehicleCode: { type: String, required: true, unique: true },
  registrationNumber: { type: String, required: true, unique: true },
  vehicleType: {
    type: String,
    enum: ['MINI_TRUCK', 'COMPACTOR', 'DUMP_TRUCK', 'RECYCLING_TRUCK', 'E_WASTE_TRUCK', 'OTHER'],
    required: true,
  },
  manufacturer: { type: String, required: true },
  model: { type: String, required: true },
  year: { type: Number, required: true },
  capacityKg: { type: Number, required: true },
  compartmentType: { type: String, required: true },
  fuelType: { type: String, required: true },
  currentFuelLevel: { type: Number, default: 100.0 },
  odometerKm: { type: Number, default: 0.0 },
  status: {
    type: String,
    enum: ['AVAILABLE', 'ASSIGNED', 'PRE_TRIP_INSPECTION', 'READY', 'IN_SERVICE', 'RETURNING', 'POST_TRIP_INSPECTION', 'BREAKDOWN', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE'],
    default: 'AVAILABLE',
  },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: null },
  },
  heading: { type: Number, default: null },
  speed: { type: Number, default: null },
  depotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Depot', required: true },
  assignedDriverId: { type: mongoose.Schema.Types.ObjectId, ref: 'DriverProfile', default: null },
}, { timestamps: true });

vehicleSchema.index({ location: '2dsphere' });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ depotId: 1 });

module.exports = {
  Depot: mongoose.model('Depot', depotSchema),
  DriverProfile: mongoose.model('DriverProfile', driverProfileSchema),
  Vehicle: mongoose.model('Vehicle', vehicleSchema),
};
