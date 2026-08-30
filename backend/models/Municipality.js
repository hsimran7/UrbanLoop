const mongoose = require('mongoose');

const municipalitySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  state: { type: String, required: true },
  country: { type: String, required: true, default: 'India' },
  contactEmail: { type: String },
  contactPhone: { type: String },
  settings: {
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
  },
  isActive: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.model('Municipality', municipalitySchema);
