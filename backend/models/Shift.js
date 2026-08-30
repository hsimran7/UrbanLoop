const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  cutoffMinutes: { type: Number, default: 60 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

const workerShiftAssignmentSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerProfile', required: true },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
  workDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['ASSIGNED', 'CONFIRMED', 'ABSENT', 'ON_LEAVE', 'CANCELLED'],
    default: 'ASSIGNED',
  },
}, { timestamps: true });
workerShiftAssignmentSchema.index({ workerId: 1, shiftId: 1, workDate: 1 }, { unique: true });

module.exports = {
  Shift: mongoose.model('Shift', shiftSchema),
  WorkerShiftAssignment: mongoose.model('WorkerShiftAssignment', workerShiftAssignmentSchema),
};
