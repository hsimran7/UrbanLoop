const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { DailyAssignment, DailyAssignmentTarget, CollectionEvent } = require('../models/Assignment');
const Bin = require('../models/Bin');
const CollectionPoint = require('../models/CollectionPoint');
const { WorkerProfile, TeamMembership, CollectionTeam, TeamServiceAssignment } = require('../models/Workforce');
const { Shift } = require('../models/Shift');
const { Area, Ward } = require('../models/Geo');
const ServiceZone = require('../models/ServiceZone');
const Vehicle = require('../models/Vehicle');
const { BinTelemetry, BinAlert } = require('../models/BinTelemetry');
const CollectionSchedule = require('../models/CollectionSchedule');
const Notification = require('../models/Notification');
const Property = require('../models/Property');
const AuditLog = require('../models/AuditLog');
const { protect, requireRoles } = require('../middleware/auth');
const { log } = require('../utils/audit');
const realtimeEventEmitter = require('../sockets/eventEmitter');

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR'];

// GET /api/v1/assignments — List all daily assignments (Admin)
router.get('/', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    let filter = {};
    if (req.query.date) {
      const start = new Date(req.query.date);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);
      filter.assignmentDate = { $gte: start, $lte: end };
    }

    const assignments = await DailyAssignment.find(filter)
      .populate({ path: 'teamId', populate: { path: 'supervisorId', select: 'email' } })
      .populate({ path: 'primaryWorkerId', populate: { path: 'userId' } })
      .populate({ path: 'partnerWorkerId', populate: { path: 'userId' } })
      .populate({ path: 'driverId', populate: { path: 'userId' } })
      .populate({ path: 'serviceZoneId', populate: { path: 'areaId' } })
      .populate('shiftId')
      .sort({ assignmentDate: -1 })
      .lean();

    const assignIds = assignments.map(a => a._id);
    const targets = await DailyAssignmentTarget.find({ assignmentId: { $in: assignIds } })
      .populate('collectionPointId')
      .populate('binId')
      .lean();

    const binIds = targets.map(t => t.binId?._id);
    const alerts = await BinAlert.find({ binId: { $in: binIds }, status: 'ACTIVE' }).lean();
    const alertMap = {};
    for (const a of alerts) {
      const bid = a.binId.toString();
      if (!alertMap[bid]) alertMap[bid] = [];
      alertMap[bid].push(a);
    }

    const targetsByAssignment = {};
    for (const t of targets) {
      const aid = t.assignmentId.toString();
      if (!targetsByAssignment[aid]) targetsByAssignment[aid] = [];
      
      const binAlerts = alertMap[t.binId?._id?.toString()] || [];
      const hasCritical = binAlerts.some(a => a.severity === 'CRITICAL');
      const hasWarning = binAlerts.some(a => a.severity === 'WARNING');
      const fillLevel = t.binId?.currentFillLevel || 0;
      
      let priority = 'NORMAL';
      if (hasCritical || fillLevel >= 90) priority = 'CRITICAL';
      else if (hasWarning || fillLevel >= 70) priority = 'HIGH';

      targetsByAssignment[aid].push({
        id: t._id.toString(),
        collectionPointId: t.collectionPointId?._id?.toString(),
        collectionPointName: t.collectionPointId?.name,
        binId: t.binId?._id?.toString(),
        binType: t.binId?.type,
        binFillLevel: fillLevel,
        status: t.status,
        addedReason: t.addedReason,
        priority,
        createdAt: t.createdAt,
      });
    }

    const result = assignments.map(assign => {
      const formattedTargets = targetsByAssignment[assign._id.toString()] || [];
      const criticalCount = formattedTargets.filter(t => t.priority === 'CRITICAL').length;
      const highCount = formattedTargets.filter(t => t.priority === 'HIGH').length;
      const newCps = formattedTargets.filter(t => t.addedReason === 'NEW_COLLECTION_POINT').length;

      return {
        id: assign._id.toString(),
        assignmentDate: assign.assignmentDate,
        teamName: assign.teamId?.name || 'Manual Assignment',
        teamCode: assign.teamId?.code || 'MANUAL',
        supervisorEmail: assign.teamId?.supervisorId?.email || null,
        zoneName: assign.serviceZoneId?.name,
        zoneCode: assign.serviceZoneId?.code,
        areaName: assign.serviceZoneId?.areaId?.name,
        shiftName: assign.shiftId?.name,
        shiftTimes: assign.shiftId ? `${assign.shiftId.startTime}-${assign.shiftId.endTime}` : '',
        wasteType: assign.wasteType,
        status: assign.status,
        generationSource: assign.generationSource,
        generatedAt: assign.generatedAt,
        createdAt: assign.createdAt,
        updatedAt: assign.updatedAt,
        assignedAt: assign.assignedAt,
        targetsCount: formattedTargets.length,
        newCollectionPointsCount: newCps,
        criticalBinsCount: criticalCount,
        highPriorityBinsCount: highCount,
        targets: formattedTargets,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/assignments/active-ops — Supervisor/Admin Operations Monitoring
router.get('/active-ops', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const endToday = new Date(today);
    endToday.setUTCHours(23, 59, 59, 999);

    const assignments = await DailyAssignment.find({
      status: { $ne: 'CANCELLED' }
    })
      .populate('teamId')
      .populate({ path: 'serviceZoneId', populate: 'areaId' })
      .populate('shiftId')
      .sort({ assignmentDate: -1 })
      .limit(50)
      .lean();

    const assignIds = assignments.map(a => a._id);
    const targets = await DailyAssignmentTarget.find({ assignmentId: { $in: assignIds } })
      .populate('collectionPointId')
      .lean();

    const targetsByAssignment = {};
    for (const t of targets) {
      const aid = t.assignmentId.toString();
      if (!targetsByAssignment[aid]) targetsByAssignment[aid] = [];
      targetsByAssignment[aid].push(t);
    }

    const result = assignments.map(a => {
      const aid = a._id.toString();
      const tgts = targetsByAssignment[aid] || [];
      const expected = tgts.length;
      const pending = tgts.filter(t => t.status === 'PENDING').length;
      const collected = tgts.filter(t => t.status === 'COLLECTED').length;
      const missed = tgts.filter(t => t.status === 'MISSED').length;
      const skipped = tgts.filter(t => t.status === 'SKIPPED').length;
      const progress = expected > 0 ? Math.round((collected / expected) * 100) : 0;

      return {
        id: aid,
        teamName: a.teamId?.name || 'Manual Assignment',
        teamCode: a.teamId?.code || 'MANUAL',
        zoneName: a.serviceZoneId?.name || 'Unassigned Zone',
        areaName: a.serviceZoneId?.areaId?.name || 'Unassigned Area',
        shiftName: a.shiftId?.name || 'Standard Shift',
        wasteType: a.wasteType || 'DRY',
        status: a.status,
        expected,
        pending,
        collected,
        missed,
        skipped,
        progress,
        assignedAt: a.assignedAt,
        flaggedTargets: [],
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/assignments/my-today (alias worker/today, worker) — Worker Portal Dashboard
router.get(['/my-today', '/worker/today', '/worker'], protect, requireRoles('WORKER', 'SUPERVISOR', 'GOVERNMENT_OFFICIAL'), async (req, res, next) => {
  try {
    const workerProfile = await WorkerProfile.findOne({ userId: req.user.id }).populate('userId');
    if (!workerProfile) return res.status(404).json({ message: 'Worker profile not found.' });

    const now = new Date();
    const membership = await TeamMembership.findOne({
      workerId: workerProfile._id,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: now } }],
    });

    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 7);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 14);
    windowEnd.setHours(23, 59, 59, 999);

    const filter = {
      status: { $ne: 'CANCELLED' },
      $or: [
        { primaryWorkerId: workerProfile._id },
        { partnerWorkerId: workerProfile._id },
        { driverId: workerProfile._id },
        { primaryWorkerId: req.user.id },
        { partnerWorkerId: req.user.id },
        { driverId: req.user.id },
      ],
    };

    if (membership) {
      filter.$or.push({ teamId: membership.teamId });
    }

    const assignments = await DailyAssignment.find(filter)
      .populate({
        path: 'teamId',
        populate: [
          { path: 'supervisorId', select: 'name email phone' },
          { path: 'memberships', populate: { path: 'workerId', populate: 'userId' } }
        ]
      })
      .populate({
        path: 'serviceZoneId',
        populate: { path: 'areaId', populate: { path: 'wardId', populate: 'cityId' } }
      })
      .populate('shiftId areaId vehicleId driverId primaryWorkerId partnerWorkerId')
      .sort({ assignmentDate: -1 })
      .lean();

    const assignIds = assignments.map(a => a._id);
    const targets = await DailyAssignmentTarget.find({ assignmentId: { $in: assignIds } })
      .populate('collectionPointId binId')
      .sort({ createdAt: 1 })
      .lean();

    const binIds = targets.map(t => t.binId?._id).filter(Boolean);
    const alerts = await BinAlert.find({ binId: { $in: binIds }, status: 'ACTIVE' }).lean();
    const telemetries = await BinTelemetry.find({ binId: { $in: binIds } }).sort({ recordedAt: -1 }).lean();

    const alertMap = {};
    for (const a of alerts) {
      const bid = a.binId.toString();
      if (!alertMap[bid]) alertMap[bid] = [];
      alertMap[bid].push(a);
    }
    const telMap = {};
    for (const t of telemetries) {
      const bid = t.binId.toString();
      if (!telMap[bid]) telMap[bid] = t; // Keep only latest
    }

    const targetsByAssignment = {};
    for (const tgt of targets) {
      const aid = tgt.assignmentId.toString();
      if (!targetsByAssignment[aid]) targetsByAssignment[aid] = [];
      
      const binAlerts = alertMap[tgt.binId?._id?.toString()] || [];
      const hasCritical = binAlerts.some(a => a.severity === 'CRITICAL');
      const hasWarning = binAlerts.some(a => a.severity === 'WARNING');
      const fillLevel = tgt.binId?.currentFillLevel || 0;
      let priority = 'NORMAL';
      if (hasCritical || fillLevel >= 90) priority = 'CRITICAL';
      else if (hasWarning || fillLevel >= 70) priority = 'HIGH';

      const latestTel = telMap[tgt.binId?._id?.toString()];

      targetsByAssignment[aid].push({
        id: tgt._id.toString(),
        collectionPointId: tgt.collectionPointId?._id?.toString(),
        collectionPointName: tgt.collectionPointId?.name,
        collectionPointLat: tgt.collectionPointId?.latitude,
        collectionPointLng: tgt.collectionPointId?.longitude,
        binId: tgt.binId?._id?.toString(),
        binQrCodeId: tgt.binId?.qrCodeId,
        binType: tgt.binId?.type,
        binFillLevel: fillLevel,
        binStatus: tgt.binId?.status,
        binCondition: tgt.binId?.condition,
        binTelemetryStatus: tgt.binId?.telemetryStatus,
        batteryLevel: latestTel?.batteryLevel ?? null,
        temperature: latestTel?.temperature ?? null,
        signalStrength: latestTel?.signalStrength ?? null,
        lastTelemetryAt: latestTel?.recordedAt ?? null,
        status: tgt.status,
        addedReason: tgt.addedReason,
        priority,
        collectedAt: tgt.collectedAt,
        createdAt: tgt.createdAt,
      });
    }

    const result = assignments.map(assign => {
      let partnerWorkers = [];
      if (assign.teamId?.memberships) {
        partnerWorkers = assign.teamId.memberships
          .filter(m => m.workerId?._id?.toString() !== workerProfile._id.toString())
          .map(m => ({
            name: m.workerId?.userId?.name,
            phone: m.workerId?.userId?.phone,
            employeeCode: m.workerId?.employeeCode,
            role: m.role,
          }));
      }

      const formattedTargets = targetsByAssignment[assign._id.toString()] || [];
      const totalTargets = formattedTargets.length;
      const collected = formattedTargets.filter(t => t.status === 'COLLECTED').length;
      const missed = formattedTargets.filter(t => t.status === 'MISSED').length;
      const skipped = formattedTargets.filter(t => t.status === 'SKIPPED').length;
      const pending = formattedTargets.filter(t => t.status === 'PENDING').length;
      const completionRate = totalTargets > 0 ? Math.round((collected / totalTargets) * 100) : 0;

      return {
        id: assign._id.toString(),
        assignmentDate: assign.assignmentDate,
        assignedAt: assign.assignedAt,
        acceptedAt: assign.acceptedAt,
        startedAt: assign.startedAt,
        completedAt: assign.completedAt,
        teamName: assign.teamId?.name || 'Manual Assignment',
        teamCode: assign.teamId?.code || 'MANUAL',
        supervisorName: assign.teamId?.supervisorId?.name || null,
        supervisorEmail: assign.teamId?.supervisorId?.email || null,
        supervisorPhone: assign.teamId?.supervisorId?.phone || null,
        zoneName: assign.serviceZoneId?.name,
        zoneCode: assign.serviceZoneId?.code,
        areaName: assign.serviceZoneId?.areaId?.name,
        wardName: assign.serviceZoneId?.areaId?.wardId?.name,
        wardNumber: assign.serviceZoneId?.areaId?.wardId?.number,
        cityName: assign.serviceZoneId?.areaId?.wardId?.cityId?.name,
        shiftName: assign.shiftId?.name ? assign.shiftId.name.replace(/\s+Shift$/i, '') : 'Morning',
        shiftStartTime: assign.shiftId?.startTime,
        shiftEndTime: assign.shiftId?.endTime,
        shiftTimes: assign.shiftId ? `${assign.shiftId.startTime}-${assign.shiftId.endTime}` : '',
        wasteType: assign.wasteType,
        status: assign.status,
        vehicle: assign.vehicleId ? {
          id: assign.vehicleId._id,
          registrationNumber: assign.vehicleId.registrationNumber,
          vehicleCode: assign.vehicleId.vehicleCode,
          vehicleType: assign.vehicleId.vehicleType,
          status: assign.vehicleId.status,
        } : null,
        driver: assign.driverId ? {
          name: assign.driverId.userId?.name,
          phone: assign.driverId.userId?.phone,
        } : null,
        partnerWorkers,
        route: null,
        targets: formattedTargets,
        expected: totalTargets,
        collected,
        missed,
        skipped,
        pending,
        completionRate,
        generationSource: assign.generationSource,
        createdAt: assign.createdAt,
        updatedAt: assign.updatedAt,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/assignments/my-schedule — Worker Portal Schedule
router.get('/my-schedule', protect, requireRoles('WORKER'), async (req, res, next) => {
  try {
    const workerProfile = await WorkerProfile.findOne({ userId: req.user.id });
    if (!workerProfile) return res.status(404).json({ message: 'Worker profile not found.' });

    const now = new Date();
    const membership = await TeamMembership.findOne({
      workerId: workerProfile._id,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: now } }],
    });
    if (!membership) return res.json([]);

    const start = new Date(now);
    start.setDate(start.getDate() - 3);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);

    const assignments = await DailyAssignment.find({
      teamId: membership.teamId,
      assignmentDate: { $gte: start, $lte: end },
    })
      .populate({ path: 'serviceZoneId', populate: { path: 'areaId', populate: 'wardId' } })
      .populate('shiftId')
      .sort({ assignmentDate: 1 })
      .lean();

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const wasteTypeSchedule = {
      SUNDAY: 'OTHER (Special Collection)',
      MONDAY: 'WET (Organic Waste)',
      TUESDAY: 'DRY (Dry Waste)',
      WEDNESDAY: 'RECYCLABLES (Recycling Day)',
      THURSDAY: 'DRY (Dry Waste)',
      FRIDAY: 'WET (Organic Waste)',
      SATURDAY: 'BULK (Bulk Waste)',
    };

    const todayStr = new Date().toISOString().split('T')[0];

    const result = assignments.map(a => {
      const d = new Date(a.assignmentDate);
      const dayName = dayNames[d.getDay()];
      const assignStr = d.toISOString().split('T')[0];
      return {
        assignmentId: a._id.toString(),
        date: a.assignmentDate,
        dayName,
        isToday: assignStr === todayStr,
        isPast: d < new Date(),
        wasteType: a.wasteType,
        scheduledWaste: wasteTypeSchedule[dayName.toUpperCase()] || a.wasteType,
        areaName: a.serviceZoneId?.areaId?.name,
        wardName: a.serviceZoneId?.areaId?.wardId?.name,
        shiftName: a.shiftId?.name,
        shiftTimes: a.shiftId ? `${a.shiftId.startTime}-${a.shiftId.endTime}` : '',
        status: a.status,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/assignments/my-summary — Worker Portal Summary
router.get('/my-summary', protect, requireRoles('WORKER'), async (req, res, next) => {
  try {
    const workerProfile = await WorkerProfile.findOne({ userId: req.user.id });
    if (!workerProfile) return res.status(404).json({ message: 'Worker profile not found.' });

    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    const now = new Date();
    const membership = await TeamMembership.findOne({
      workerId: workerProfile._id,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: now } }],
    });
    if (!membership) return res.json(null);

    const assignments = await DailyAssignment.find({ teamId: membership.teamId })
      .populate('shiftId serviceZoneId areaId')
      .lean();

    const todayAssignments = assignments.filter(a => new Date(a.assignmentDate).toISOString().split('T')[0] === dateStr);
    
    const assignIds = todayAssignments.map(a => a._id);
    const targets = await DailyAssignmentTarget.find({ assignmentId: { $in: assignIds } }).lean();

    const totalBins = targets.length;
    const collected = targets.filter(t => t.status === 'COLLECTED').length;
    const missed = targets.filter(t => t.status === 'MISSED').length;
    const skipped = targets.filter(t => t.status === 'SKIPPED').length;
    
    const areaMap = {};
    for (const a of todayAssignments) {
      if (a.areaId) areaMap[a.areaId.name] = true;
    }
    const areasCovered = Object.keys(areaMap);

    let hoursWorked = 0;
    for (const a of todayAssignments) {
      if (a.startedAt && a.completedAt) {
        hoursWorked += (new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime()) / 3600000;
      } else if (a.startedAt) {
        hoursWorked += (Date.now() - new Date(a.startedAt).getTime()) / 3600000;
      }
    }

    const estimatedDistanceKm = areasCovered.length * 4.8;
    const wasteTypesMap = {};
    todayAssignments.forEach(a => wasteTypesMap[a.wasteType] = true);

    res.json({
      date: dateStr,
      areasCovered,
      totalBins,
      collected,
      missed,
      skipped,
      completionRate: totalBins > 0 ? Math.round((collected / totalBins) * 100) : 0,
      hoursWorked: Math.round(hoursWorked * 10) / 10,
      estimatedDistanceKm,
      wasteTypes: Object.keys(wasteTypesMap),
      shiftName: todayAssignments[0]?.shiftId?.name || null,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/assignments/my-notifications
router.get('/my-notifications', protect, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(notifications.map(n => ({ ...n, id: n._id.toString() })));
  } catch (err) { next(err); }
});

router.post('/my-notifications/read-all', protect, async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) { next(err); }
});

router.post('/my-notifications/:id/read', protect, async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true, readAt: new Date() }
    );
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) { next(err); }
});

// GET /api/v1/assignments/worker/history
router.get('/worker/history', protect, requireRoles('WORKER', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const wp = await WorkerProfile.findOne({ userId: req.user.id });
    if (!wp) return res.status(404).json({ message: 'Worker profile not found.' });

    const query = {
      $or: [
        { primaryWorkerId: wp._id },
        { partnerWorkerId: wp._id },
        { driverId: wp._id }
      ],
      status: { $in: ['COMPLETED', 'CANCELLED', 'MISSED', 'REJECTED'] }
    };

    const total = await DailyAssignment.countDocuments(query);
    const assignments = await DailyAssignment.find(query)
      .populate('shiftId areaId serviceZoneId')
      .populate({ path: 'areaId', populate: { path: 'wardId', select: 'name number' } })
      .populate({ path: 'serviceZoneId', populate: { path: 'areaId' } })
      .sort({ assignmentDate: -1, completedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const formatted = await Promise.all(assignments.map(async (a) => {
      const targetsCount = await DailyAssignmentTarget.countDocuments({ assignmentId: a._id });
      const completedCount = await DailyAssignmentTarget.countDocuments({ assignmentId: a._id, status: 'COLLECTED' });
      const areaName = a.areaId?.name || a.serviceZoneId?.areaId?.name || 'Unknown Area';
      const wardName = a.areaId?.wardId?.name || (a.areaId?.wardId?.number ? `Ward ${a.areaId.wardId.number}` : '');

      return {
        id: a._id.toString(),
        assignmentDate: a.assignmentDate,
        areaName,
        wardName,
        shiftName: a.shiftId?.name || 'Unknown Shift',
        shiftTimes: a.shiftId ? `${a.shiftId.startTime}-${a.shiftId.endTime}` : '',
        wasteType: a.wasteType,
        status: a.status,
        expected: targetsCount,
        collected: completedCount,
        assignedAt: a.assignedAt,
        acceptedAt: a.acceptedAt,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        createdAt: a.createdAt,
      };
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) { next(err); }
});

// GET /api/v1/assignments/history (Admin History API)
router.get('/history', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    let filter = {};
    if (req.query.workerId) {
      const wp = await WorkerProfile.findOne({ userId: req.query.workerId });
      if (wp) {
        filter.$or = [
          { primaryWorkerId: wp._id },
          { partnerWorkerId: wp._id },
          { driverId: wp._id }
        ];
      }
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.date) {
      const d = new Date(req.query.date);
      filter.assignmentDate = {
        $gte: new Date(d.setHours(0,0,0,0)),
        $lte: new Date(d.setHours(23,59,59,999))
      };
    }
    if (req.query.areaId) filter.areaId = req.query.areaId;
    if (req.query.shiftId) filter.shiftId = req.query.shiftId;
    
    if (req.query.wardId && !req.query.areaId) {
       const areas = await Area.find({ wardId: req.query.wardId }).select('_id');
       filter.areaId = { $in: areas.map(a => a._id) };
    } else if (req.query.cityId && !req.query.wardId) {
       const wards = await Ward.find({ cityId: req.query.cityId }).select('_id');
       const areas = await Area.find({ wardId: { $in: wards.map(w => w._id) } }).select('_id');
       filter.areaId = { $in: areas.map(a => a._id) };
    }

    const total = await DailyAssignment.countDocuments(filter);
    const assignments = await DailyAssignment.find(filter)
      .populate('shiftId areaId')
      .populate({ path: 'primaryWorkerId', populate: { path: 'userId', select: 'name email phone' } })
      .populate({ path: 'areaId', populate: { path: 'wardId', select: 'name number' } })
      .sort({ assignmentDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const formatted = await Promise.all(assignments.map(async (a) => {
      const targetsCount = await DailyAssignmentTarget.countDocuments({ assignmentId: a._id });
      const completedCount = await DailyAssignmentTarget.countDocuments({ assignmentId: a._id, status: 'COLLECTED' });
      return {
        id: a._id.toString(),
        assignmentDate: a.assignmentDate,
        status: a.status,
        wasteType: a.wasteType,
        workerName: a.primaryWorkerId?.userId?.name || 'Unassigned',
        areaName: a.areaId?.name || 'Unknown',
        wardName: a.areaId?.wardId?.name || (a.areaId?.wardId?.number ? `Ward ${a.areaId.wardId.number}` : ''),
        shiftName: a.shiftId?.name || '',
        expected: targetsCount,
        collected: completedCount,
        assignedAt: a.assignedAt,
        completedAt: a.completedAt,
      };
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) { next(err); }
});

// Helper to verify if worker is assigned to an assignment
const verifyWorkerAssignment = async (assign, userId) => {
  if (!assign) return false;
  const wp = await WorkerProfile.findOne({ userId });
  const userWpId = wp ? wp._id.toString() : null;

  const pWorkerUserId = assign.primaryWorkerId?.userId?._id?.toString()
    || assign.primaryWorkerId?.userId?.toString()
    || assign.primaryWorkerId?._id?.toString()
    || assign.primaryWorkerId?.toString();

  const partnerUserId = assign.partnerWorkerId?.userId?._id?.toString()
    || assign.partnerWorkerId?.userId?.toString()
    || assign.partnerWorkerId?._id?.toString()
    || assign.partnerWorkerId?.toString();

  const driverUserId = assign.driverId?.userId?._id?.toString()
    || assign.driverId?.userId?.toString()
    || assign.driverId?._id?.toString()
    || assign.driverId?.toString();

  const pWorkerWpId = assign.primaryWorkerId?._id?.toString() || assign.primaryWorkerId?.toString();
  const partnerWpId = assign.partnerWorkerId?._id?.toString() || assign.partnerWorkerId?.toString();
  const driverWpId = assign.driverId?._id?.toString() || assign.driverId?.toString();

  if (pWorkerUserId === userId || partnerUserId === userId || driverUserId === userId) return true;
  if (userWpId && (pWorkerWpId === userWpId || partnerWpId === userWpId || driverWpId === userWpId)) return true;
  return false;
};

// POST /api/v1/assignments/:id/accept — Worker accept shift
router.post('/:id/accept', protect, requireRoles('WORKER', 'DRIVER', 'SUPERVISOR', 'GOVERNMENT_OFFICIAL', 'SYSTEM_ADMIN'), async (req, res, next) => {
  try {
    const assign = await DailyAssignment.findById(req.params.id).populate('areaId');
    if (!assign) return res.status(404).json({ message: 'Assignment not found.' });

    const previousStatus = assign.status;
    assign.status = 'ACCEPTED';
    assign.acceptedAt = new Date();
    await assign.save();

    await AuditLog.create({
      userId: req.user.id,
      action: 'ASSIGNMENT_STATUS_UPDATE',
      details: { assignmentId: assign._id.toString(), previousStatus, newStatus: 'ACCEPTED', timestamp: assign.acceptedAt }
    });

    realtimeEventEmitter.emit('TASK_STATUS_UPDATED', {
      assignmentId: assign._id.toString(),
      status: assign.status,
      workerName: req.user.name,
      areaName: assign.areaId?.name
    });

    res.json({ success: true, message: 'Assignment accepted successfully.', status: assign.status });
  } catch (err) { next(err); }
});

// POST /api/v1/assignments/:id/reject — Worker reject shift
router.post('/:id/reject', protect, requireRoles('WORKER', 'DRIVER', 'SUPERVISOR', 'GOVERNMENT_OFFICIAL', 'SYSTEM_ADMIN'), async (req, res, next) => {
  try {
    const assign = await DailyAssignment.findById(req.params.id).populate('areaId');
    if (!assign) return res.status(404).json({ message: 'Assignment not found.' });

    const previousStatus = assign.status;
    assign.status = 'CANCELLED';
    assign.notes = req.body?.reason ? `Rejected by worker: ${req.body.reason}` : 'Rejected by worker';
    await assign.save();

    await AuditLog.create({
      userId: req.user.id,
      action: 'ASSIGNMENT_STATUS_UPDATE',
      details: { assignmentId: assign._id.toString(), previousStatus, newStatus: 'CANCELLED', timestamp: new Date() }
    });

    realtimeEventEmitter.emit('TASK_STATUS_UPDATED', {
      assignmentId: assign._id.toString(),
      status: 'CANCELLED',
      workerName: req.user.name,
      areaName: assign.areaId?.name
    });

    res.json({ success: true, message: 'Assignment rejected.', status: 'CANCELLED' });
  } catch (err) { next(err); }
});

// POST /api/v1/assignments/:id/start — Worker start shift
router.post('/:id/start', protect, requireRoles('WORKER', 'DRIVER', 'SUPERVISOR', 'GOVERNMENT_OFFICIAL', 'SYSTEM_ADMIN'), async (req, res, next) => {
  try {
    const assign = await DailyAssignment.findById(req.params.id).populate('areaId teamId');
    if (!assign) return res.status(404).json({ message: 'Assignment not found.' });

    const previousStatus = assign.status;
    assign.status = 'IN_PROGRESS';
    assign.startedAt = new Date();
    assign.startedById = req.user.id;
    await assign.save();

    await AuditLog.create({
      userId: req.user.id,
      action: 'ASSIGNMENT_STATUS_UPDATE',
      details: { assignmentId: assign._id.toString(), previousStatus, newStatus: 'IN_PROGRESS', timestamp: assign.startedAt }
    });

    await log(req.user.id, 'WORKER_START_ASSIGNMENT', req.ip, req.headers['user-agent'], {
      assignmentId: assign._id,
      teamId: assign.teamId?._id,
      areaId: assign.areaId?._id,
    });

    realtimeEventEmitter.emit('TASK_STATUS_UPDATED', {
      assignmentId: assign._id.toString(),
      status: assign.status,
      workerName: req.user.name,
      areaName: assign.areaId?.name
    });

    realtimeEventEmitter.emit('assignmentStarted', {
      assignmentId: assign._id.toString(),
      teamId: assign.teamId?._id?.toString(),
      startedAt: assign.startedAt.toISOString(),
      startedBy: req.user.id,
      areaId: assign.areaId?._id?.toString(),
    });

    res.json({ ...assign.toObject(), id: assign._id.toString() });
  } catch (err) { next(err); }
});

// POST /api/v1/assignments/:id/complete — Worker complete shift
router.post('/:id/complete', protect, requireRoles('WORKER', 'DRIVER', 'SUPERVISOR', 'GOVERNMENT_OFFICIAL', 'SYSTEM_ADMIN'), async (req, res, next) => {
  try {
    const assign = await DailyAssignment.findById(req.params.id).populate('areaId teamId');
    if (!assign) return res.status(404).json({ message: 'Assignment not found.' });

    const targets = await DailyAssignmentTarget.find({ assignmentId: assign._id });
    let uncollected = targets.filter(t => t.status === 'PENDING');
    if (uncollected.length > 0) {
      await DailyAssignmentTarget.updateMany(
        { _id: { $in: uncollected.map(u => u._id) } },
        { status: 'MISSED' }
      );
    }

    const previousStatus = assign.status;
    assign.status = 'COMPLETED';
    assign.completedAt = new Date();
    assign.completedById = req.user.id;
    await assign.save();

    await AuditLog.create({
      userId: req.user.id,
      action: 'ASSIGNMENT_STATUS_UPDATE',
      details: { assignmentId: assign._id.toString(), previousStatus, newStatus: 'COMPLETED', timestamp: assign.completedAt }
    });

    await log(req.user.id, 'WORKER_COMPLETE_ASSIGNMENT', req.ip, req.headers['user-agent'], {
      assignmentId: assign._id,
      teamId: assign.teamId?._id,
      areaId: assign.areaId?._id,
    });

    realtimeEventEmitter.emit('TASK_STATUS_UPDATED', {
      assignmentId: assign._id.toString(),
      status: assign.status,
      workerName: req.user.name,
      areaName: assign.areaId?.name
    });

    realtimeEventEmitter.emit('assignmentCompleted', {
      assignmentId: assign._id.toString(),
      teamId: assign.teamId?._id?.toString(),
      completedAt: assign.completedAt.toISOString(),
      completedBy: req.user.id,
      areaId: assign.areaId?._id?.toString(),
    });

    res.json({
      success: true,
      message: 'Assignment completed successfully.',
      status: assign.status,
      completedAt: assign.completedAt,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/assignments/:assignmentId/targets/:targetId/collect
router.post('/:assignmentId/targets/:targetId/collect', protect, requireRoles('WORKER'), async (req, res, next) => {
  try {
    const { assignmentId, targetId } = req.params;
    const { latitude, longitude, locationAccuracy, clientEventId, evidenceId } = req.body;

    const target = await DailyAssignmentTarget.findOne({ _id: targetId, assignmentId }).populate('binId collectionPointId');
    if (!target) return res.status(404).json({ message: 'Target not found.' });

    const assign = await DailyAssignment.findById(assignmentId);
    if (!assign) return res.status(404).json({ message: 'Assignment not found.' });

    target.status = 'COLLECTED';
    target.collectedAt = new Date();
    target.collectedById = req.user.id;
    await target.save();

    const bin = target.binId;
    if (bin) {
      bin.status = 'EMPTY';
      bin.currentFillLevel = 0;
      bin.lastEmptiedAt = new Date();
      await bin.save();
    }

    const event = await CollectionEvent.create({
      assignmentId,
      targetId,
      binId: target.binId?._id,
      collectionPointId: target.collectionPointId?._id,
      workerId: req.user.id,
      teamId: assign.teamId,
      eventType: 'COLLECTED',
      occurredAt: new Date(),
      latitude: latitude || null,
      longitude: longitude || null,
      locationAccuracy: locationAccuracy || null,
      clientEventId,
      evidenceId: evidenceId || null,
      verificationLevel: 'VERIFIED',
    });

    await log(req.user.id, 'COLLECT_TARGET', req.ip, req.headers['user-agent'], {
      assignmentId, targetId, binId: bin?._id, eventId: event._id
    });

    realtimeEventEmitter.emit('targetCollected', {
      assignmentId,
      targetId,
      binId: bin?._id?.toString(),
      status: 'COLLECTED',
      timestamp: new Date().toISOString(),
    });
    
    if (bin) {
      realtimeEventEmitter.emit('binOverflow', {
        binId: bin._id.toString(),
        status: 'EMPTY',
        currentFillLevel: 0,
        collectionPointId: bin.collectionPointId?.toString(),
        dispatchedAt: new Date().toISOString(),
      });
    }

    res.json({ success: true, target: { ...target.toObject(), id: target._id.toString() } });
  } catch (err) { next(err); }
});

// POST /api/v1/assignments/:assignmentId/targets/:targetId/miss
router.post('/:assignmentId/targets/:targetId/miss', protect, requireRoles('WORKER'), async (req, res, next) => {
  try {
    const { assignmentId, targetId } = req.params;
    const { reasonCode, notes, latitude, longitude, clientEventId, evidenceId } = req.body;

    const target = await DailyAssignmentTarget.findOne({ _id: targetId, assignmentId });
    if (!target) return res.status(404).json({ message: 'Target not found.' });

    const assign = await DailyAssignment.findById(assignmentId);
    
    target.status = 'MISSED';
    await target.save();

    await CollectionEvent.create({
      assignmentId,
      targetId,
      binId: target.binId,
      collectionPointId: target.collectionPointId,
      workerId: req.user.id,
      teamId: assign.teamId,
      eventType: 'MISSED',
      occurredAt: new Date(),
      latitude: latitude || null,
      longitude: longitude || null,
      clientEventId,
      evidenceId: evidenceId || null,
      reasonCode,
      notes,
      verificationLevel: 'UNVERIFIED',
    });

    realtimeEventEmitter.emit('targetMissed', {
      assignmentId,
      targetId,
      binId: target.binId.toString(),
      status: 'MISSED',
      reasonCode,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, target: { ...target.toObject(), id: target._id.toString() } });
  } catch (err) { next(err); }
});

// POST /api/v1/assignments/manual-planner — Create manual assignment
router.post('/manual-planner', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      workerId, partnerWorkerId, vehicleId, driverId, areaId, wardId, cityId, districtId, stateId, zoneId,
      wasteType, shiftId, assignmentDate, date, startTime, endTime,
      priority, estimatedBinCount, estimatedDuration, notes
    } = req.body;

    const targetDateStr = assignmentDate || date;
    if (!workerId || !areaId || !shiftId || !targetDateStr) {
      return res.status(400).json({ message: 'workerId, areaId, shiftId, and date (or assignmentDate) are required.' });
    }

    const targetDate = new Date(targetDateStr);
    targetDate.setUTCHours(0, 0, 0, 0);

    const shift = await Shift.findById(shiftId);
    if (!shift) return res.status(404).json({ message: 'Selected Shift not found.' });

    let targetZoneId = zoneId;
    if (!targetZoneId || !mongoose.Types.ObjectId.isValid(targetZoneId)) {
      let sz = await ServiceZone.findOne({ areaId });
      if (!sz) {
        sz = await ServiceZone.create({ areaId, name: 'Default Zone', code: `SZ-${areaId.toString().slice(-6)}` });
      }
      targetZoneId = sz._id.toString();
    }

    if (vehicleId) {
      const vehicle = await Vehicle.findById(vehicleId);
      if (vehicle) {
        const vehicleOverlap = await DailyAssignment.findOne({
          vehicleId,
          assignmentDate: targetDate,
          shiftId,
          status: { $ne: 'CANCELLED' }
        });
        if (vehicleOverlap) {
          return res.status(400).json({ message: 'Selected Vehicle is already assigned for this shift on this date.' });
        }
        vehicle.status = 'active';
        await vehicle.save();
      }
    }

    // ── Resolve User IDs → WorkerProfile IDs ─────────────────────────────────
    // The frontend sends User._id values, but the DailyAssignment schema stores
    // WorkerProfile._id refs. We resolve them here so all downstream queries work.
    console.log('[ASSIGNMENT] Resolving workerIds (User IDs from frontend):', { workerId, partnerWorkerId, driverId });

    const resolveToWorkerProfileId = async (userId) => {
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;
      let wp = await WorkerProfile.findOne({ userId });
      if (!wp) {
        console.log(`[ASSIGNMENT] WorkerProfile missing for userId=${userId}, creating automatically...`);
        const userObj = await User.findById(userId);
        if (!userObj) return null;
        wp = await WorkerProfile.create({
          userId: userObj._id,
          employeeCode: `EMP-${userObj._id.toString().substring(18)}`,
          phone: userObj.phone || null,
          employmentStatus: 'ACTIVE',
          joinedAt: new Date(),
        });
      }
      return wp._id;
    };

    const primaryWorkerProfileId = await resolveToWorkerProfileId(workerId);
    if (!primaryWorkerProfileId) {
      return res.status(400).json({ message: 'Selected worker does not have a worker profile. Please register the worker first.' });
    }
    const partnerWorkerProfileId = partnerWorkerId ? await resolveToWorkerProfileId(partnerWorkerId) : null;
    const driverWorkerProfileId = driverId ? await resolveToWorkerProfileId(driverId) : null;

    console.log('[ASSIGNMENT] Resolved WorkerProfile IDs:', { primaryWorkerProfileId, partnerWorkerProfileId, driverWorkerProfileId });

    const workerProfileIds = [primaryWorkerProfileId, partnerWorkerProfileId, driverWorkerProfileId].filter(Boolean);
    const workerOverlap = await DailyAssignment.findOne({
      assignmentDate: targetDate,
      shiftId,
      status: { $ne: 'CANCELLED' },
      $or: [
        { primaryWorkerId: { $in: workerProfileIds } },
        { partnerWorkerId: { $in: workerProfileIds } },
        { driverId: { $in: workerProfileIds } }
      ]
    });
    if (workerOverlap) {
      return res.status(400).json({ message: 'One or more selected workers are already assigned for this shift on this date.' });
    }

    const da = await DailyAssignment.create({
      assignmentDate: targetDate,
      primaryWorkerId: primaryWorkerProfileId,   // WorkerProfile._id (correct ref)
      partnerWorkerId: partnerWorkerProfileId || null,
      driverId: driverWorkerProfileId || primaryWorkerProfileId,
      vehicleId: vehicleId || null,
      serviceZoneId: targetZoneId,
      areaId,
      wasteType: wasteType || 'DRY',
      shiftId,
      status: 'ASSIGNED',
      generationSource: 'MANUAL',
      assignedAt: new Date(),
      priority: priority || 'NORMAL',
      notes: notes || null,
      estimatedDuration: estimatedDuration ? parseInt(estimatedDuration) : null,
      estimatedBinCount: estimatedBinCount ? parseInt(estimatedBinCount) : null,
    });

    console.log('[ASSIGNMENT SAVED]', { assignmentId: da._id.toString(), primaryWorkerId: primaryWorkerProfileId.toString(), userIdFromFrontend: workerId });

    if (req.user) {
      await AuditLog.create({
        userId: req.user.id,
        action: 'ASSIGNMENT_STATUS_UPDATE',
        details: { assignmentId: da._id.toString(), previousStatus: null, newStatus: 'ASSIGNED', timestamp: da.assignedAt }
      });
    }

    const properties = await Property.find({ areaId }).lean();
    const propIds = properties.map(p => p._id);
    const points = await CollectionPoint.find({ $or: [{ areaId }, { propertyId: { $in: propIds } }] }).lean();
    const pointIds = points.map(p => p._id);
    let bins = await Bin.find({ collectionPointId: { $in: pointIds } });

    if (bins.length === 0 && points.length > 0) {
      for (const pt of points) {
        const newBin = await Bin.create({
          qrCodeId: `BIN-${pt._id.toString().slice(-6)}`,
          type: wasteType || 'DRY',
          collectionPointId: pt._id,
          currentFillLevel: Math.floor(Math.random() * 40) + 10,
          status: 'EMPTY',
        });
        bins.push(newBin);
      }
    }

    const targets = [];
    for (const bin of bins) {
      const tgt = await DailyAssignmentTarget.create({
        assignmentId: da._id,
        collectionPointId: bin.collectionPointId,
        binId: bin._id,
        status: 'PENDING',
        addedReason: 'SCHEDULED'
      });
      targets.push(tgt);
    }

    const populated = await DailyAssignment.findById(da._id)
      .populate({ path: 'teamId', populate: { path: 'supervisorId', select: 'email name' } })
      .populate({ path: 'primaryWorkerId', populate: { path: 'userId', select: 'name email' } })
      .populate({ path: 'partnerWorkerId', populate: { path: 'userId', select: 'name email' } })
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'name email' } })
      .populate({ path: 'serviceZoneId', populate: { path: 'areaId', populate: { path: 'wardId', select: 'name number' } } })
      .populate({ path: 'areaId', populate: { path: 'wardId', select: 'name number' } })
      .populate('shiftId')
      .lean();

    const resolvedAreaName = populated.areaId?.name || populated.serviceZoneId?.areaId?.name || 'your area';
    const resolvedWardName = populated.areaId?.wardId?.name || populated.serviceZoneId?.areaId?.wardId?.name
      || (populated.areaId?.wardId?.number ? `Ward ${populated.areaId.wardId.number}` : '');
    const rawShiftName = populated.shiftId?.name || shift.name || 'Morning';
    const resolvedShiftName = rawShiftName.replace(/\s+Shift$/i, '');
    const resolvedDateStr = targetDate.toISOString().split('T')[0];
    const resolvedHousesCount = targets.length;
    // uniqueWorkerIds = User._id values from the frontend (not WorkerProfile IDs)
    const uniqueUserIds = Array.from(new Set([workerId, partnerWorkerId, driverId].filter(Boolean)));

    for (const uId of uniqueUserIds) {
      // MUST use findOne({userId}) — the incoming IDs are User._id, not WorkerProfile._id
      const wProfile = await WorkerProfile.findOne({ userId: uId });
      if (wProfile && wProfile.userId) {
        console.log('[NOTIFICATION] Creating for userId:', wProfile.userId.toString());
        const notifBody = [
          `You have been assigned new collection work.`,
          resolvedAreaName ? `\nArea: ${resolvedAreaName}` : '',
          resolvedWardName ? `\nWard: ${resolvedWardName}` : '',
          `\nShift: ${resolvedShiftName}`,
          `\nDate: ${resolvedDateStr}`,
          resolvedHousesCount > 0 ? `\nHouses: ${resolvedHousesCount}` : '',
        ].join('');

        const notif = await Notification.create({
          userId: wProfile.userId,
          title: 'New Work Assigned',
          body: notifBody,
          type: 'TASK_ASSIGNED',
          isRead: false,
          metadata: {
            assignmentId: da._id.toString(),
            areaName: resolvedAreaName,
            wardName: resolvedWardName,
            shiftName: resolvedShiftName,
            assignmentDate: resolvedDateStr,
            housesCount: resolvedHousesCount,
          }
        });

        console.log('[NOTIFICATION CREATED] recipientId:', wProfile.userId.toString(), 'assignmentId:', da._id.toString());
        console.log('[SOCKET EMIT] TASK_ASSIGNED → room:', `worker:${wProfile.userId.toString()}`);
        
        realtimeEventEmitter.emit('notification', {
          userId: wProfile.userId.toString(),
          id: notif._id.toString(),
          title: 'New Work Assigned',
          body: notifBody,
          type: 'TASK_ASSIGNED',
          isRead: false,
          assignmentId: da._id.toString(),
          areaName: resolvedAreaName,
          wardName: resolvedWardName,
          shiftName: resolvedShiftName,
          assignmentDate: resolvedDateStr,
          timestamp: new Date().toISOString(),
        });

        const formattedTargets = targets.map(t => {
          const matchedBin = bins.find(b => b._id.toString() === t.binId.toString());
          const matchedPoint = points.find(p => p._id.toString() === t.collectionPointId.toString());
          return {
            id: t._id.toString(),
            collectionPointId: t.collectionPointId.toString(),
            collectionPointName: matchedPoint?.name || 'Anonymous Stop',
            binId: t.binId.toString(),
            binType: matchedBin?.type || wasteType,
            binFillLevel: matchedBin?.currentFillLevel || 0,
            status: t.status,
            addedReason: t.addedReason,
            priority: 'NORMAL',
          };
        });

        const taskPayload = {
          id: populated._id.toString(),
          assignmentDate: populated.assignmentDate,
          startedAt: populated.startedAt,
          completedAt: populated.completedAt,
          teamName: populated.teamId?.name || 'Manual Assignment',
          teamCode: populated.teamId?.code || 'MANUAL',
          supervisorName: populated.teamId?.supervisorId?.name || null,
          supervisorEmail: populated.teamId?.supervisorId?.email || null,
          supervisorPhone: populated.teamId?.supervisorId?.phone || null,
          zoneName: populated.serviceZoneId?.name,
          zoneCode: populated.serviceZoneId?.code,
          areaName: resolvedAreaName,
          wardName: resolvedWardName,
          shiftName: resolvedShiftName,
          shiftStartTime: populated.shiftId?.startTime,
          shiftEndTime: populated.shiftId?.endTime,
          shiftTimes: populated.shiftId ? `${populated.shiftId.startTime}-${populated.shiftId.endTime}` : '',
          wasteType: populated.wasteType,
          status: populated.status,
          targets: formattedTargets,
          expected: formattedTargets.length,
          collected: 0,
          missed: 0,
          skipped: 0,
          pending: formattedTargets.length,
          completionRate: 0,
          generationSource: populated.generationSource,
          createdAt: populated.createdAt,
          updatedAt: populated.updatedAt,
          assignedAt: populated.assignedAt,
          acceptedAt: populated.acceptedAt,
          notificationBody: `You have been assigned collection work in ${resolvedAreaName}${resolvedWardName ? ', ' + resolvedWardName : ''} on ${resolvedShiftName} (${resolvedDateStr}). ${resolvedHousesCount} collection point(s) assigned.`,
        };

        realtimeEventEmitter.emit('TASK_ASSIGNED', {
          workerIds: [wProfile.userId.toString()],
          task: taskPayload
        });
      }
    }

    realtimeEventEmitter.emit('assignmentCreated', {
      assignmentId: da._id.toString(),
      action: 'CREATED_MANUALLY'
    });
    realtimeEventEmitter.emit('notificationCreated', { type: 'ASSIGNMENT_NEW' });

    res.status(201).json({
      success: true,
      message: 'Advanced Collection Assignment successfully created and synced to Worker Dashboards.',
      assignment: da
    });
  } catch (err) { next(err); }
});

// PATCH /api/v1/assignments/:id — Update assignment
router.patch('/:id', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { shiftId } = req.body;
    
    const assign = await DailyAssignment.findById(id);
    if (!assign) return res.status(404).json({ message: 'Assignment not found.' });

    if (shiftId) {
      const shift = await Shift.findById(shiftId);
      if (!shift) return res.status(404).json({ message: 'Shift not found.' });
      assign.shiftId = shiftId;
    }

    await assign.save();

    const populated = await DailyAssignment.findById(id)
      .populate({ path: 'teamId', populate: { path: 'supervisorId', select: 'email' } })
      .populate({ path: 'primaryWorkerId', populate: { path: 'userId' } })
      .populate({ path: 'partnerWorkerId', populate: { path: 'userId' } })
      .populate({ path: 'driverId', populate: { path: 'userId' } })
      .populate({ path: 'serviceZoneId', populate: { path: 'areaId' } })
      .populate('shiftId')
      .lean();

    const workerUserId = populated.primaryWorkerId?.userId?._id?.toString();
    
    realtimeEventEmitter.emit('assignmentUpdated', {
      assignmentId: id,
      action: 'SHIFT_UPDATED'
    });

    if (workerUserId) {
      const targets = await DailyAssignmentTarget.find({ assignmentId: id })
        .populate('collectionPointId')
        .populate('binId')
        .lean();

      const formattedTargets = targets.map(t => ({
        id: t._id.toString(),
        collectionPointId: t.collectionPointId?._id?.toString(),
        collectionPointName: t.collectionPointId?.name,
        binId: t.binId?._id?.toString(),
        binType: t.binId?.type,
        binFillLevel: t.binId?.currentFillLevel || 0,
        status: t.status,
        addedReason: t.addedReason,
        priority: 'NORMAL',
      }));

      const taskPayload = {
        id: populated._id.toString(),
        assignmentDate: populated.assignmentDate,
        startedAt: populated.startedAt,
        completedAt: populated.completedAt,
        teamName: populated.teamId?.name || 'Manual Assignment',
        teamCode: populated.teamId?.code || 'MANUAL',
        supervisorName: populated.teamId?.supervisorId?.name || null,
        supervisorEmail: populated.teamId?.supervisorId?.email || null,
        supervisorPhone: populated.teamId?.supervisorId?.phone || null,
        zoneName: populated.serviceZoneId?.name,
        zoneCode: populated.serviceZoneId?.code,
        areaName: populated.serviceZoneId?.areaId?.name,
        shiftName: populated.shiftId?.name,
        shiftStartTime: populated.shiftId?.startTime,
        shiftEndTime: populated.shiftId?.endTime,
        shiftTimes: populated.shiftId ? `${populated.shiftId.startTime}-${populated.shiftId.endTime}` : '',
        wasteType: populated.wasteType,
        status: populated.status,
        targets: formattedTargets,
        expected: formattedTargets.length,
        collected: formattedTargets.filter(t => t.status === 'COLLECTED').length,
        missed: formattedTargets.filter(t => t.status === 'MISSED').length,
        skipped: formattedTargets.filter(t => t.status === 'SKIPPED').length,
      };

      realtimeEventEmitter.emit('TASK_ASSIGNED', {
        workerIds: [workerUserId],
        task: taskPayload
      });
    }

    res.json({ success: true, message: 'Assignment updated successfully.' });
  } catch (err) { next(err); }
});

// GET /api/v1/assignments/citizen-history — Citizen collection history
router.get('/citizen-history', protect, async (req, res, next) => {
  try {
    const events = await CollectionEvent.find()
      .sort({ occurredAt: -1 })
      .limit(20)
      .lean();

    const result = events.map(e => ({
      targetId: e.targetId?.toString() || e._id.toString(),
      address: e.locationAccuracy ? `Location Accuracy: ${e.locationAccuracy}m` : 'Registered Residence',
      wasteType: 'WET',
      status: e.eventType || 'COLLECTED',
      collectedAt: e.occurredAt || e.createdAt,
      binType: 'STANDARD',
    }));

    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
