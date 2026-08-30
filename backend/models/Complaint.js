const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  municipalityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Municipality', required: true },
  citizenId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['missed_pickup', 'overflowing_bin', 'illegal_dumping', 'damaged_bin', 'other'],
    required: true
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  address: { type: String },
  photos: [{ type: String }], // Cloudinary URLs
  status: { 
    type: String, 
    enum: ['open', 'in_progress', 'resolved', 'rejected'],
    default: 'open'
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  assignedWorker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  resolutionNotes: { type: String },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

complaintSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Complaint', complaintSchema);
