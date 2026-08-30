const mongoose = require('mongoose');

// DailyAssignment — the core worker task assignment model
const dailyAssignmentSchema = new mongoose.Schema({
  assignmentDate: { type: Date, required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTeam', default: null },
  primaryWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerProfile', default: null },
  partnerWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerProfile', default: null },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerProfile', default: null },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  serviceZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceZone', required: true },
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
  scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionSchedule', default: null },
  wasteType: {
    type: String,
    enum: ['DRY', 'WET', 'E_WASTE', 'RECYCLABLES', 'HAZARDOUS', 'BULK', 'OTHER'],
    required: true,
  },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
  status: {
    type: String,
    enum: ['CREATED', 'ASSIGNED', 'ACCEPTED', 'STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'MISSED', 'CANCELLED'],
    default: 'CREATED',
  },
  generationSource: { type: String, enum: ['AUTOMATIC', 'MANUAL'], default: 'AUTOMATIC' },
  generatedAt: { type: Date, default: Date.now },
  assignedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  startedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  completedAt: { type: Date, default: null },
  completedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'], default: 'NORMAL' },
  notes: { type: String, default: null },
  estimatedDuration: { type: Number, default: null },
  estimatedBinCount: { type: Number, default: null },
}, { timestamps: true });

dailyAssignmentSchema.index({ assignmentDate: 1, status: 1 });
dailyAssignmentSchema.index({ primaryWorkerId: 1 });
dailyAssignmentSchema.index({ partnerWorkerId: 1 });
dailyAssignmentSchema.index({ teamId: 1 });
dailyAssignmentSchema.index({ areaId: 1 });

// DailyAssignmentTarget — individual bin targets within an assignment
const dailyAssignmentTargetSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyAssignment', required: true },
  collectionPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionPoint', required: true },
  binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', required: true },
  status: {
    type: String,
    enum: ['PENDING', 'COLLECTED', 'MISSED', 'SKIPPED', 'CANCELLED'],
    default: 'PENDING',
  },
  addedReason: {
    type: String,
    enum: ['SCHEDULED', 'NEW_COLLECTION_POINT', 'MANUAL'],
    default: 'SCHEDULED',
  },
  collectedAt: { type: Date, default: null },
  collectedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

dailyAssignmentTargetSchema.index({ assignmentId: 1 });
dailyAssignmentTargetSchema.index({ binId: 1 });

// CollectionEvent
const collectionEventSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyAssignment', required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyAssignmentTarget', required: true },
  binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', required: true },
  collectionPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionPoint', required: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTeam', required: true },
  eventType: { type: String, enum: ['COLLECTED', 'MISSED', 'SKIPPED', 'CORRECTED'], required: true },
  occurredAt: { type: Date, required: true },
  receivedAt: { type: Date, default: Date.now },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  locationAccuracy: { type: Number, default: null },
  notes: { type: String, default: null },
  reasonCode: { type: String, default: null },
  evidenceId: { type: String, default: null },
  clientEventId: { type: String, required: true, unique: true },
  distanceFromTarget: { type: Number, default: null },
  verificationLevel: {
    type: String,
    enum: ['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'FLAGGED'],
    default: 'UNVERIFIED',
  },
}, { timestamps: { createdAt: true, updatedAt: false } });

collectionEventSchema.index({ assignmentId: 1 });
collectionEventSchema.index({ binId: 1 });

module.exports = {
  DailyAssignment: mongoose.model('DailyAssignment', dailyAssignmentSchema),
  DailyAssignmentTarget: mongoose.model('DailyAssignmentTarget', dailyAssignmentTargetSchema),
  CollectionEvent: mongoose.model('CollectionEvent', collectionEventSchema),
};
