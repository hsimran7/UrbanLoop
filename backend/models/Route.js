const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  municipalityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Municipality', required: true },
  name: { type: String, required: true },
  description: { type: String },
  assignedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  assignedWorker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  path: {
    type: { type: String, enum: ['LineString'], default: 'LineString' },
    coordinates: { type: [[Number]], required: true } // Array of [longitude, latitude] arrays
  },
  bins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SmartBin' }],
  estimatedDuration: { type: Number }, // in minutes
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

routeSchema.index({ path: '2dsphere' });

module.exports = mongoose.model('Route', routeSchema);