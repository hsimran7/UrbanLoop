const mongoose = require('mongoose');

const stateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
}, { timestamps: true });

const districtSchema = new mongoose.Schema({
  name: { type: String, required: true },
  stateId: { type: mongoose.Schema.Types.ObjectId, ref: 'State', required: true },
}, { timestamps: true });
districtSchema.index({ stateId: 1, name: 1 }, { unique: true });

const citySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
}, { timestamps: true });

const wardSchema = new mongoose.Schema({
  number: { type: Number, required: true },
  name: { type: String, required: true },
  cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
}, { timestamps: true });
wardSchema.index({ cityId: 1, number: 1 }, { unique: true });

const areaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ward', required: true },
}, { timestamps: true });

const streetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  serviceZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceZone', required: true },
}, { timestamps: true });
streetSchema.index({ serviceZoneId: 1, name: 1 }, { unique: true });

module.exports = {
  State: mongoose.model('State', stateSchema),
  District: mongoose.model('District', districtSchema),
  City: mongoose.model('City', citySchema),
  Ward: mongoose.model('Ward', wardSchema),
  Area: mongoose.model('Area', areaSchema),
  Street: mongoose.model('Street', streetSchema),
};
