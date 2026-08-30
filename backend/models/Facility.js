const mongoose = require('mongoose');

// WasteFacility
const wasteFacilitySchema = new mongoose.Schema({
  facilityCode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  facilityType: {
    type: String,
    enum: ['MATERIAL_RECOVERY_FACILITY', 'COMPOSTING_FACILITY', 'E_WASTE_FACILITY', 'TRANSFER_STATION', 'LANDFILL', 'OTHER'],
    required: true,
  },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED'], default: 'ACTIVE' },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number],
  },
  address: { type: String, required: true },
  dailyCapacityKg: { type: Number, default: null },
  acceptedWasteTypes: [{ type: String, enum: ['DRY', 'WET', 'E_WASTE', 'RECYCLABLES', 'HAZARDOUS', 'BULK', 'OTHER'] }],
  staffAssignments: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String },
    effectiveFrom: { type: Date },
    effectiveUntil: { type: Date, default: null },
    status: { type: String, default: 'ACTIVE' },
  }],
}, { timestamps: true });
wasteFacilitySchema.index({ location: '2dsphere' });

// WasteLoad
const wasteLoadSchema = new mongoose.Schema({
  loadCode: { type: String, required: true, unique: true },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyAssignment', required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTeam', required: true },
  wasteType: {
    type: String,
    enum: ['DRY', 'WET', 'E_WASTE', 'RECYCLABLES', 'HAZARDOUS', 'BULK', 'OTHER'],
    required: true,
  },
  status: {
    type: String,
    enum: ['OPEN', 'SEALED', 'IN_TRANSIT', 'ARRIVED', 'WEIGHED', 'ACCEPTED', 'PARTIALLY_REJECTED', 'REJECTED', 'CLOSED'],
    default: 'OPEN',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  openedAt: { type: Date, default: Date.now },
  sealedAt: { type: Date, default: null },
  sealedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sealCode: { type: String, default: null },
  deliveredAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = {
  WasteFacility: mongoose.model('WasteFacility', wasteFacilitySchema),
  WasteLoad: mongoose.model('WasteLoad', wasteLoadSchema),
};
