const mongoose = require('mongoose');

// WorkerProfile
const workerProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  employeeCode: { type: String, required: true, unique: true },
  employmentStatus: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE'],
    default: 'ACTIVE',
  },
  phone: { type: String, default: null },
  joinedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// CollectionTeam
const collectionTeamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// TeamMembership
const teamMembershipSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTeam', required: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerProfile', required: true },
  role: { type: String, enum: ['DRIVER', 'COLLECTOR', 'TEAM_LEAD'], required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
teamMembershipSchema.index({ teamId: 1, workerId: 1 });

// TeamServiceAssignment
const teamServiceAssignmentSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTeam', required: true },
  serviceZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceZone', required: true },
  wasteType: {
    type: String,
    enum: ['DRY', 'WET', 'E_WASTE', 'RECYCLABLES', 'HAZARDOUS', 'BULK', 'OTHER'],
    default: null,
  },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

module.exports = {
  WorkerProfile: mongoose.model('WorkerProfile', workerProfileSchema),
  CollectionTeam: mongoose.model('CollectionTeam', collectionTeamSchema),
  TeamMembership: mongoose.model('TeamMembership', teamMembershipSchema),
  TeamServiceAssignment: mongoose.model('TeamServiceAssignment', teamServiceAssignmentSchema),
};
