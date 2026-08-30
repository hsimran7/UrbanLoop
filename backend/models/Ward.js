const mongoose = require('mongoose');

const wardSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true
  },
  zoneId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Zone',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please add a ward name'],
    trim: true
  },
  wardNumber: {
    type: String,
    required: true
  },
  wardManager: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  boundary: {
    type: {
      type: String,
      enum: ['Polygon'],
      default: 'Polygon'
    },
    coordinates: {
      type: [[[Number]]],
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

wardSchema.index({ boundary: '2dsphere' });

module.exports = mongoose.model('Ward', wardSchema);
