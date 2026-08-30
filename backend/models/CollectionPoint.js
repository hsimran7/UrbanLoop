const mongoose = require('mongoose');

const collectionPointSchema = new mongoose.Schema({
  name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] }, // [longitude, latitude]
  },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  serviceZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceZone', default: null },
  streetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Street', default: null },
}, { timestamps: true });

collectionPointSchema.index({ location: '2dsphere' });
collectionPointSchema.index({ areaId: 1 });
collectionPointSchema.index({ propertyId: 1 });

module.exports = mongoose.model('CollectionPoint', collectionPointSchema);
