const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  address: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number] }, // [longitude, latitude]
  },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
  streetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Street', default: null },
  status: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
}, { timestamps: true });

propertySchema.index({ location: '2dsphere' });
propertySchema.index({ ownerId: 1 });
propertySchema.index({ areaId: 1 });
propertySchema.index({ status: 1 });

module.exports = mongoose.model('Property', propertySchema);
