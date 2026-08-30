const mongoose = require('mongoose');

const collectionScheduleSchema = new mongoose.Schema({
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
  wasteType: {
    type: String,
    enum: ['DRY', 'WET', 'E_WASTE', 'RECYCLABLES', 'HAZARDOUS', 'BULK', 'OTHER'],
    required: true,
  },
  dayOfWeek: {
    type: String,
    enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
    required: true,
  },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  binId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bin', default: null },
}, { timestamps: true });

collectionScheduleSchema.index({ areaId: 1 });
collectionScheduleSchema.index({ dayOfWeek: 1, status: 1 });

module.exports = mongoose.model('CollectionSchedule', collectionScheduleSchema);
