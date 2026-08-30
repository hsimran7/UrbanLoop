const express = require('express');
const router = express.Router();
const { Shift, WorkerShiftAssignment } = require('../models/Shift');
const { WorkerProfile } = require('../models/Workforce');
const { protect } = require('../middleware/auth');

// GET /api/v1/shifts - Get all shifts
router.get('/', protect, async (req, res, next) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    let shifts = await Shift.find(filter).sort({ startTime: 1 }).lean();

    // Ensure 3 standard shifts (Morning, Evening, Night) exist in MongoDB
    if (shifts.length < 3) {
      const standardShifts = [
        { name: 'Morning', startTime: '06:00', endTime: '14:00', cutoffMinutes: 60, status: 'ACTIVE' },
        { name: 'Evening', startTime: '14:00', endTime: '22:00', cutoffMinutes: 60, status: 'ACTIVE' },
        { name: 'Night', startTime: '22:00', endTime: '06:00', cutoffMinutes: 60, status: 'ACTIVE' },
      ];
      for (const s of standardShifts) {
        const exists = await Shift.findOne({ name: new RegExp(`^${s.name}`, 'i') });
        if (!exists) {
          await Shift.create(s);
        }
      }
      shifts = await Shift.find(filter).sort({ startTime: 1 }).lean();
    }

    res.json(shifts.map(s => ({
      id: s._id.toString(),
      _id: s._id.toString(),
      name: s.name.replace(/\s+Shift$/i, ''),
      startTime: s.startTime,
      endTime: s.endTime,
      cutoffMinutes: s.cutoffMinutes,
      status: s.status,
      isActive: s.status === 'ACTIVE'
    })));
  } catch (err) { next(err); }
});

// POST /api/v1/shifts - Create a shift
router.post('/', protect, async (req, res, next) => {
  try {
    const { name, startTime, endTime, cutoffMinutes } = req.body;
    if (!name || !startTime || !endTime) {
      return res.status(400).json({ message: 'Name, startTime, and endTime are required.' });
    }
    const shift = await Shift.create({
      name,
      startTime,
      endTime,
      cutoffMinutes: cutoffMinutes || 60,
      status: 'ACTIVE'
    });
    res.status(201).json({
      id: shift._id.toString(),
      _id: shift._id.toString(),
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      cutoffMinutes: shift.cutoffMinutes,
      status: shift.status,
      isActive: true
    });
  } catch (err) { next(err); }
});

// GET /api/v1/shifts/assignments - Get shift assignments
router.get('/assignments', protect, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.workDate) {
      const targetDate = new Date(req.query.workDate);
      targetDate.setUTCHours(0, 0, 0, 0);
      filter.workDate = targetDate;
    }
    const assignments = await WorkerShiftAssignment.find(filter)
      .populate('shiftId')
      .populate({
        path: 'workerId',
        populate: { path: 'userId' }
      })
      .lean();

    res.json(assignments.map(a => {
      const worker = a.workerId;
      return {
        id: a._id.toString(),
        _id: a._id.toString(),
        workDate: a.workDate ? a.workDate.toISOString().split('T')[0] : '',
        shiftId: a.shiftId?._id?.toString() || a.shiftId || '',
        workerProfileId: worker?._id?.toString() || '',
        shift: a.shiftId ? {
          name: a.shiftId.name,
          startTime: a.shiftId.startTime,
          endTime: a.shiftId.endTime,
        } : null,
        worker: worker ? {
          employeeId: worker.employeeCode || `EMP-${worker._id.toString().substring(18)}`,
          employeeCode: worker.employeeCode || null,
          // Flat fields for easy frontend access
          email: worker.email || worker.userId?.email || '',
          name: worker.userId?.name || worker.name || '',
          user: {
            email: worker.email || worker.userId?.email || '',
            name: worker.userId?.name || worker.name || '',
          }
        } : null
      };
    }));
  } catch (err) { next(err); }
});

// POST /api/v1/shifts/:shiftId/assignments - Assign worker to a shift
router.post('/:shiftId/assignments', protect, async (req, res, next) => {
  try {
    const { shiftId } = req.params;
    const { workerId, workDate, status } = req.body;
    
    if (!workerId || !workDate) {
      return res.status(400).json({ message: 'workerId and workDate are required.' });
    }

    const targetDate = new Date(workDate);
    targetDate.setUTCHours(0, 0, 0, 0);

    const assignment = await WorkerShiftAssignment.findOneAndUpdate(
      { workerId, shiftId, workDate: targetDate },
      { status: status || 'ASSIGNED' },
      { upsert: true, new: true }
    );

    res.status(201).json({
      id: assignment._id.toString(),
      _id: assignment._id.toString(),
      workerProfileId: workerId,
      shiftId,
      workDate: targetDate.toISOString().split('T')[0],
      status: assignment.status
    });
  } catch (err) { next(err); }
});

module.exports = router;
