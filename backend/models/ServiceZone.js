const mongoose = require('mongoose');

const serviceZoneSchema = new mongoose.Schema({
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

module.exports = mongoose.model('ServiceZone', serviceZoneSchema);
