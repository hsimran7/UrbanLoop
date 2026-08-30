const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema({
  municipalityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Municipality', required: true },
  routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // State Machine
  status: { 
    type: String, 
    enum: [
      'scheduled', 
      'assigned', 
      'vehicle_started', 
      'bin_scanned', 
      'collected', 
      'transferred', 
      'disposed', 
      'verified', 
      'closed'
    ],
    default: 'scheduled'
  },
  
  scheduledTime: { type: Date, required: true },
  startedAt: { type: Date },
  completedAt: { type: Date },
  
  binsCollected: [{
    binId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmartBin' },
    scannedAt: { type: Date },
    fillLevelBefore: { type: Number },
    weightCollected: { type: Number }
  }],
  
  totalWeight: { type: Number, default: 0 },
  photos: [{ type: String }], // Cloudinary URLs for verification
  notes: { type: String },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.model('Collection', collectionSchema);
