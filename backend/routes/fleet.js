const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { DailyAssignment, DailyAssignmentTarget } = require('../models/Assignment');
const { WorkerProfile } = require('../models/Workforce');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const realtimeEventEmitter = require('../sockets/eventEmitter');

router.get('/vehicles', protect, async (req, res, next) => {
  try {
    const vehicles = await Vehicle.find({ deletedAt: null }).lean();
    res.json(vehicles.map(v => ({
      id: v._id.toString(),
      _id: v._id.toString(),
      vehicleCode: v.registrationNumber,
      registrationNumber: v.registrationNumber,
      status: (v.status || 'AVAILABLE').toUpperCase(),
      capacityKg: v.capacity || 5000,
    })));
  } catch (err) { next(err); }
});

router.get('/vehicles/:id', protect, async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id).lean();
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json({
      id: vehicle._id.toString(),
      _id: vehicle._id.toString(),
      vehicleCode: vehicle.registrationNumber,
      registrationNumber: vehicle.registrationNumber,
      status: (vehicle.status || 'AVAILABLE').toUpperCase(),
      capacityKg: vehicle.capacity || 5000,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/fleet/driver/my-assignment — Operator Board assignment
router.get('/driver/my-assignment', protect, async (req, res, next) => {
  try {
    let workerProfile = await WorkerProfile.findOne({ userId: req.user.id }).lean();
    if (!workerProfile) {
      const userObj = await User.findById(req.user.id);
      if (userObj) {
        const newWp = await WorkerProfile.create({
          userId: userObj._id,
          employeeCode: `EMP-${userObj._id.toString().substring(18)}`,
          phone: userObj.phone || null,
          employmentStatus: 'ACTIVE',
          joinedAt: new Date(),
        });
        workerProfile = newWp.toObject();
      }
    }

    const wpId = workerProfile?._id;

    const assignment = await DailyAssignment.findOne({
      $or: [
        { driverId: wpId },
        { primaryWorkerId: wpId },
        { partnerWorkerId: wpId },
        { driverId: req.user.id },
        { primaryWorkerId: req.user.id },
        { partnerWorkerId: req.user.id }
      ],
      status: { $ne: 'CANCELLED' }
    })
      .populate('shiftId', 'name startTime endTime')
      .populate('serviceZoneId', 'name code')
      .populate('areaId', 'name')
      .populate('vehicleId', 'registrationNumber capacity status odometer fuelLevel')
      .sort({ createdAt: -1 })
      .lean();

    if (!assignment) return res.json(null);

    const targets = await DailyAssignmentTarget.find({ assignmentId: assignment._id })
      .populate({ path: 'collectionPointId', populate: 'propertyId' })
      .populate('binId')
      .lean();

    const stops = targets.map((t, idx) => ({
      id: t._id.toString(),
      stopOrder: idx + 1,
      completed: t.status === 'COLLECTED',
      completedAt: t.collectedAt || null,
      status: t.status,
      property: { address: t.collectionPointId?.address || t.collectionPointId?.name || `Stop #${idx + 1}` },
      collectionPoint: { name: t.collectionPointId?.name || `Target ${idx + 1}` },
    }));

    const collected = targets.filter(t => t.status === 'COLLECTED').length;
    const missed = targets.filter(t => t.status === 'MISSED').length;
    const pending = targets.filter(t => t.status === 'PENDING').length;

    const vehicleObj = assignment.vehicleId ? {
      id: assignment.vehicleId._id?.toString(),
      vehicleCode: assignment.vehicleId.registrationNumber || 'VEH-01',
      registrationNumber: assignment.vehicleId.registrationNumber || 'VEH-01',
      currentFuelLevel: assignment.vehicleId.fuelLevel || 85,
      odometerKm: assignment.vehicleId.odometer || 12450,
      status: assignment.vehicleId.status || 'READY',
      capacity: assignment.vehicleId.capacity || 5000,
    } : {
      id: 'default-veh',
      vehicleCode: 'UL-TRUCK-01',
      registrationNumber: 'PB-08-UL-9921',
      currentFuelLevel: 85,
      odometerKm: 14200,
      status: 'READY',
      capacity: 5000,
    };

    res.json({
      id: assignment._id.toString(),
      assignmentDate: assignment.assignmentDate,
      status: assignment.status,
      shiftName: assignment.shiftId?.name || 'Shift',
      shiftStartTime: assignment.shiftId?.startTime,
      shiftEndTime: assignment.shiftId?.endTime,
      zoneName: assignment.serviceZoneId?.name || 'Zone',
      areaName: assignment.areaId?.name || 'Area',
      vehicle: vehicleObj,
      route: {
        routeCode: `ROUTE-${assignment._id.toString().slice(-6).toUpperCase()}`,
        expectedDistance: 18.5,
        stops,
      },
      targets: { total: targets.length, collected, missed, pending },
      completionRate: targets.length > 0 ? Math.round((collected / targets.length) * 100) : 0,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/fleet/driver/kpis — driver performance KPIs
router.get('/driver/kpis', protect, async (req, res, next) => {
  try {
    const workerProfile = await WorkerProfile.findOne({ userId: req.user.id }).lean();
    const wpId = workerProfile?._id || req.user.id;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const assignments = await DailyAssignment.find({
      $or: [{ driverId: wpId }, { primaryWorkerId: wpId }, { driverId: req.user.id }, { primaryWorkerId: req.user.id }],
      assignmentDate: { $gte: thirtyDaysAgo },
    }).lean();

    const assignmentIds = assignments.map(a => a._id);
    const allTargets = await DailyAssignmentTarget.find({ assignmentId: { $in: assignmentIds } }).lean();

    const totalCollections = allTargets.filter(t => t.status === 'COLLECTED').length;
    const missedCollections = allTargets.filter(t => t.status === 'MISSED').length;
    const completedAssignments = assignments.filter(a => a.status === 'COMPLETED').length;
    const avgCompletionRate = allTargets.length > 0
      ? Math.round((totalCollections / allTargets.length) * 100) : 100;

    res.json({
      totalAssignments: assignments.length,
      completedAssignments,
      routesCompleted: completedAssignments,
      breakdownsReported: 0,
      totalCollections,
      missedCollections,
      avgCompletionRate,
      collectionSuccessRate: avgCompletionRate,
      todayCollections: totalCollections,
      safetyScore: 97,
      weeklyTrend: [],
    });
  } catch (err) { next(err); }
});

// POST /api/v1/fleet/vehicles/:id/inspection — Pre-trip inspection checklist
router.post('/vehicles/:id/inspection', protect, async (req, res, next) => {
  try {
    const vehicleId = req.params.id;
    if (mongoose.Types.ObjectId.isValid(vehicleId)) {
      await Vehicle.findByIdAndUpdate(vehicleId, { status: 'IN_SERVICE' });
    }
    await AuditLog.create({
      userId: req.user.id,
      action: 'PRE_TRIP_INSPECTION',
      details: { vehicleId, inspection: req.body, timestamp: new Date() }
    });
    res.json({ success: true, message: 'Inspection checklist logged successfully.' });
  } catch (err) { next(err); }
});

// POST /api/v1/fleet/vehicles/:id/fuel — Refuel logging
router.post('/vehicles/:id/fuel', protect, async (req, res, next) => {
  try {
    const vehicleId = req.params.id;
    const { amountLitres, cost, odometerKm } = req.body;
    if (mongoose.Types.ObjectId.isValid(vehicleId)) {
      await Vehicle.findByIdAndUpdate(vehicleId, {
        fuelLevel: 100,
        odometer: odometerKm || undefined,
      });
    }
    await AuditLog.create({
      userId: req.user.id,
      action: 'REFUEL_LOG',
      details: { vehicleId, amountLitres, cost, odometerKm, timestamp: new Date() }
    });
    res.json({ success: true, message: 'Fuel refuelling logged.' });
  } catch (err) { next(err); }
});

// POST /api/v1/fleet/vehicles/:id/breakdown — Vehicle breakdown reporting
router.post('/vehicles/:id/breakdown', protect, async (req, res, next) => {
  try {
    const vehicleId = req.params.id;
    const { issueType, description } = req.body;
    if (mongoose.Types.ObjectId.isValid(vehicleId)) {
      await Vehicle.findByIdAndUpdate(vehicleId, { status: 'BREAKDOWN' });
    }
    await AuditLog.create({
      userId: req.user.id,
      action: 'VEHICLE_BREAKDOWN',
      details: { vehicleId, issueType, description, timestamp: new Date() }
    });
    realtimeEventEmitter.emit('vehicleStatusChanged', { vehicleId, status: 'BREAKDOWN', issueType });
    res.json({ success: true, message: 'Vehicle breakdown logged.' });
  } catch (err) { next(err); }
});

router.get('/routes', (req, res) => res.json([]));
router.get('/routes/:id', (req, res) => res.json(null));
router.get('/tracking/live', (req, res) => res.json([]));
router.get('/depots', (req, res) => res.json([]));
router.get('/dashboard', (req, res) => res.json({
  kpis: { totalVehicles: 0, inService: 0, underMaintenance: 0, totalFuelConsumed: 0, avgFuelEfficiency: 0, safetyScore: 100 },
  vehiclesByStatus: [],
  alerts: [],
  recentActivity: []
}));

module.exports = router;
