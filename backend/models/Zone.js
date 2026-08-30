const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  municipalityId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Municipality',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Please add a zone name'],
    trim: true
  },
  description: String,
  boundary: {
    type: {
      type: String,
      enum: ['Polygon'],
      default: 'Polygon'
    },
    coordinates: {
      type: [[[Number]]], // Array of arrays of arrays of numbers for GeoJSON polygon
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

zoneSchema.index({ boundary: '2dsphere' });

module.exports = mongoose.model('Zone', zoneSchema);
