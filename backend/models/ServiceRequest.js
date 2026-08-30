const mongoose = require('mongoose');

// ServiceRequestCategory
const serviceRequestCategorySchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, default: 'ACTIVE' },
  defaultPriority: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'],
    default: 'NORMAL',
  },
  requiresLocation: { type: Boolean, default: false },
  allowsAnonymous: { type: Boolean, default: false },
  requiresEvidence: { type: Boolean, default: false },
}, { timestamps: true });

// ServiceRequest (complaints + other requests)
const serviceRequestSchema = new mongoose.Schema({
  requestCode: { type: String, required: true, unique: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequestCategory', required: true },
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  collectionPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionPoint', default: null },
  binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', default: null },
  title: { type: String, required: true },
  description: { type: String, required: true },
  priority: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'],
    default: 'NORMAL',
  },
  status: {
    type: String,
    enum: ['SUBMITTED', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_INFORMATION', 'RESOLVED', 'REOPENED', 'CLOSED', 'REJECTED', 'CANCELLED'],
    default: 'SUBMITTED',
  },
  source: {
    type: String,
    enum: ['CITIZEN_PORTAL', 'GOVERNMENT_STAFF', 'WORKER', 'SYSTEM_GENERATED'],
    default: 'CITIZEN_PORTAL',
  },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: null },
  },
  addressText: { type: String, default: null },
  assignedDepartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  assignedTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionTeam', default: null },
  assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  submittedAt: { type: Date, default: Date.now },
  acknowledgedAt: { type: Date, default: null },
  workStartedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  // Evidence/comments embedded for simplicity
  comments: [{
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    visibility: { type: String, enum: ['PUBLIC', 'INTERNAL'], default: 'PUBLIC' },
    message: { type: String },
    createdAt: { type: Date, default: Date.now },
  }],
  evidences: [{
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    storageKey: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    evidenceType: { type: String },
    createdAt: { type: Date, default: Date.now },
  }],
  events: [{
    eventType: { type: String },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    occurredAt: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed },
  }],
}, { timestamps: true });

serviceRequestSchema.index({ createdByUserId: 1 });
serviceRequestSchema.index({ status: 1 });
serviceRequestSchema.index({ areaId: 1 });
serviceRequestSchema.index({ location: '2dsphere' });

module.exports = {
  ServiceRequestCategory: mongoose.model('ServiceRequestCategory', serviceRequestCategorySchema),
  ServiceRequest: mongoose.model('ServiceRequest', serviceRequestSchema),
};
