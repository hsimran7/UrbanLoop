const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const CollectionSchedule = require('../models/CollectionSchedule');
const { Area } = require('../models/Geo');
const { protect, requireRoles } = require('../middleware/auth');
const realtimeEventEmitter = require('../sockets/eventEmitter');

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR'];

// GET /api/v1/schedules — List all collection schedules
router.get('/', protect, async (req, res, next) => {
  try {
    const schedules = await CollectionSchedule.find()
      .populate('areaId')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = schedules.map(s => ({
      id: s._id.toString(),
      areaId: s.areaId?._id?.toString() || s.areaId,
      areaName: s.areaId?.name || 'Municipal Area',
      wasteType: s.wasteType || 'MIXED',
      dayOfWeek: s.dayOfWeek || 'MONDAY',
      frequency: s.frequency || 'WEEKLY',
      startTime: s.startTime || '08:00',
      endTime: s.endTime || '12:00',
      effectiveFrom: s.effectiveFrom,
      effectiveUntil: s.effectiveUntil,
      status: s.status || 'ACTIVE',
      createdAt: s.createdAt,
    }));

    res.json(formatted);
  } catch (err) { next(err); }
});

// POST /api/v1/schedules — Admin create new collection schedule
router.post('/', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { areaId, wasteType, dayOfWeek, startTime, endTime, effectiveFrom, effectiveUntil, frequency, daysOfWeek } = req.body;

    let targetAreaId = areaId;
    if (!targetAreaId || !mongoose.Types.ObjectId.isValid(targetAreaId)) {
      const defaultArea = await Area.findOne();
      if (defaultArea) targetAreaId = defaultArea._id;
    }

    const schedule = await CollectionSchedule.create({
      areaId: targetAreaId,
      wasteType: wasteType || 'WET',
      dayOfWeek: dayOfWeek || 'MONDAY',
      startTime: startTime || '08:00',
      endTime: endTime || '12:00',
      frequency: frequency || 'WEEKLY',
      daysOfWeek: daysOfWeek || [1, 3, 5],
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveUntil: effectiveUntil ? new Date(effectiveUntil) : null,
      createdBy: req.user.id,
      status: 'ACTIVE',
    });

    realtimeEventEmitter.emit('scheduleUpdated', {
      id: schedule._id.toString(),
      areaId: targetAreaId?.toString(),
      status: 'ACTIVE',
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      message: 'Schedule created successfully.',
      schedule: { ...schedule.toObject(), id: schedule._id.toString() },
    });
  } catch (err) { next(err); }
});

// PATCH /api/v1/schedules/:id/status — Admin update schedule status
router.patch('/:id/status', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { status } = req.body;
    const schedule = await CollectionSchedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found.' });

    schedule.status = status;
    await schedule.save();

    realtimeEventEmitter.emit('scheduleUpdated', {
      id: schedule._id.toString(),
      status: schedule.status,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      schedule: { ...schedule.toObject(), id: schedule._id.toString() },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/schedules/schedule-exceptions — Create Schedule Exception
router.post(['/schedule-exceptions', '/exceptions'], protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { scheduleId, exceptionType, originalDate, replacementDate, replacementStartTime, replacementEndTime, reason, wasteType } = req.body;
    
    realtimeEventEmitter.emit('scheduleUpdated', {
      scheduleId,
      exceptionType,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      message: 'Schedule exception created successfully.',
      exception: {
        id: `ex-${Date.now()}`,
        scheduleId,
        exceptionType: exceptionType || 'CANCELLED',
        originalDate,
        replacementDate,
        reason,
        createdAt: new Date().toISOString(),
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;
