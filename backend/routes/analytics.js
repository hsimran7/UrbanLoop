const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Bin = require('../models/Bin');
const { DailyAssignment } = require('../models/Assignment');
const ServiceRequest = require('../models/ServiceRequest');
const { Ward, Area } = require('../models/Geo');
const CollectionPoint = require('../models/CollectionPoint');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

// GET /api/v1/analytics/dashboard — Command Center Dashboard Metrics
router.get('/dashboard', protect, async (req, res, next) => {
  try {
    const totalVehicles = await Vehicle.countDocuments();
    const activeVehicles = await Vehicle.countDocuments({ status: { $in: ['active', 'IN_SERVICE', 'AVAILABLE', 'ON_ROUTE'] } });
    const vehicleUtilization = totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 100;
    
    const totalWorkers = await User.countDocuments({ role: { $in: ['WORKER', 'DRIVER', 'SUPERVISOR', 'worker', 'driver', 'supervisor'] } });
    const activeWorkers = await User.countDocuments({ role: { $in: ['WORKER', 'DRIVER', 'SUPERVISOR', 'worker', 'driver', 'supervisor'] }, status: 'ACTIVE' });

    const totalBins = await Bin.countDocuments();
    const overflowBins = await Bin.countDocuments({ currentFillLevel: { $gte: 80 } });
    
    const totalRequests = await ServiceRequest.countDocuments();
    const resolvedRequests = await ServiceRequest.countDocuments({ status: { $in: ['RESOLVED', 'CLOSED'] } });
    const complaintResolutionRate = totalRequests > 0 ? Math.round((resolvedRequests / totalRequests) * 100) : 100;

    const citizenSatisfaction = totalRequests > 0 ? parseFloat(Math.min(5, (3.8 + (resolvedRequests / totalRequests) * 1.1)).toFixed(1)) : 4.8;
    const fleetHealthScore = totalVehicles > 0 ? Math.min(100, Math.round(80 + (activeVehicles / totalVehicles) * 20)) : 95;

    const upcomingRisks = [];
    if (overflowBins > 0) {
      upcomingRisks.push({
        id: 'risk-overflow',
        title: `${overflowBins} Bins Over 80% Fill Capacity`,
        area: 'Priority Collection Required',
        severity: 'HIGH',
      });
    }
    if (totalRequests - resolvedRequests > 0) {
      upcomingRisks.push({
        id: 'risk-requests',
        title: `${totalRequests - resolvedRequests} Citizen Complaints Pending`,
        area: 'Service Operations',
        severity: 'MEDIUM',
      });
    }
    if (upcomingRisks.length === 0) {
      upcomingRisks.push({
        id: 'risk-nominal',
        title: 'All Systems Operating Within Target Thresholds',
        area: 'City Operations',
        severity: 'LOW',
      });
    }

    const aiRecommendations = [
      { id: 'rec-1', text: 'Dispatch collection vehicle to high-fill density zones', impact: 'HIGH' },
      { id: 'rec-2', text: 'Re-assign available workers to pending citizen requests', impact: 'MEDIUM' },
    ];

    res.json({
      kpis: {
        totalVehicles,
        activeVehicles,
        vehicleUtilization,
        totalWorkers,
        activeWorkers,
        totalBins,
        overflowBins,
        totalRequests,
        resolvedRequests,
        complaintResolutionRate,
        citizenSatisfaction,
        fleetHealthScore,
      },
      upcomingRisks,
      aiRecommendations,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/analytics/wards — Ward Performance Analytics
router.get('/wards', protect, async (req, res, next) => {
  try {
    const wards = await Ward.find().lean();
    const formattedWards = await Promise.all(wards.map(async (w) => {
      const areas = await Area.find({ wardId: w._id }).select('_id');
      const areaIds = areas.map(a => a._id);
      const points = await CollectionPoint.find({ areaId: { $in: areaIds } }).select('_id');
      const pointIds = points.map(p => p._id);
      const overflowCount = await Bin.countDocuments({ collectionPointId: { $in: pointIds }, currentFillLevel: { $gte: 80 } });
      const score = Math.max(50, 100 - (overflowCount * 10));

      return {
        id: w._id.toString(),
        name: w.name || `Ward ${w.number}`,
        number: w.number,
        score,
        overflowBins: overflowCount,
        areaCount: areas.length,
      };
    }));

    formattedWards.sort((a, b) => b.score - a.score);
    const topPerforming = formattedWards.slice(0, 5);
    const bottomPerforming = [...formattedWards].reverse().slice(0, 5);

    res.json({ topPerforming, bottomPerforming });
  } catch (err) { next(err); }
});

// GET /api/v1/analytics/reports — Operational Reports
router.get('/reports', protect, async (req, res, next) => {
  try {
    const assignmentsCount = await DailyAssignment.countDocuments();
    const completedAssignments = await DailyAssignment.countDocuments({ status: 'COMPLETED' });
    const pendingRequests = await ServiceRequest.countDocuments({ status: 'PENDING' });

    res.json([
      { title: 'Daily Collection Completion', value: `${completedAssignments}/${assignmentsCount} Tasks`, date: new Date().toISOString().split('T')[0] },
      { title: 'Open Service Requests', value: `${pendingRequests} Pending`, date: new Date().toISOString().split('T')[0] },
    ]);
  } catch (err) { next(err); }
});

// GET /api/v1/analytics/area-highlights — Area density & GIS highlights
router.get('/area-highlights', protect, async (req, res, next) => {
  try {
    const areas = await Area.find().lean();
    const highlights = await Promise.all(areas.slice(0, 10).map(async (a, i) => {
      const points = await CollectionPoint.find({ areaId: a._id }).lean();
      const pointIds = points.map(p => p._id);
      const overflowCount = await Bin.countDocuments({ collectionPointId: { $in: pointIds }, currentFillLevel: { $gte: 80 } });

      const centerLat = points[0]?.latitude || (30.9009 + (i * 0.005));
      const centerLng = points[0]?.longitude || (75.8573 + (i * 0.005));
      
      let color = 'green';
      if (overflowCount > 3) color = 'red';
      else if (overflowCount > 0) color = 'orange';

      return {
        id: a._id.toString(),
        name: a.name,
        center: { lat: centerLat, lng: centerLng },
        color,
        overflowBins: overflowCount,
      };
    }));

    res.json(highlights);
  } catch (err) { next(err); }
});

// GET /api/v1/analytics/command-center-data — Live GIS markers
router.get('/command-center-data', protect, async (req, res, next) => {
  try {
    const filter = req.query.filter || 'All Critical';
    const markers = [];

    if (filter === 'Overflow Bins' || filter === 'All Critical') {
      const overflowBins = await Bin.find({ currentFillLevel: { $gte: 75 } }).populate('collectionPointId').lean();
      for (const b of overflowBins) {
        const cp = b.collectionPointId;
        markers.push({
          lat: cp?.latitude || (30.9009 + Math.random() * 0.02),
          lng: cp?.longitude || (75.8573 + Math.random() * 0.02),
          title: `Bin ${b.qrCodeId || b._id.toString().slice(-4)} (${b.currentFillLevel}% Full)`,
          type: 'OVERFLOW_BIN',
        });
      }
    }

    if (filter === 'Pending Complaints' || filter === 'All Critical') {
      const pendingReqs = await ServiceRequest.find({ status: 'PENDING' }).lean();
      for (const sr of pendingReqs) {
        markers.push({
          lat: sr.location?.coordinates?.[1] || (30.9009 + Math.random() * 0.02),
          lng: sr.location?.coordinates?.[0] || (75.8573 + Math.random() * 0.02),
          title: `Request: ${sr.title || sr.requestNumber || 'Service Request'}`,
          type: 'PENDING_REQUEST',
        });
      }
    }

    if (markers.length === 0) {
      const points = await CollectionPoint.find().limit(10).lean();
      for (const cp of points) {
        markers.push({
          lat: cp.latitude || 30.9009,
          lng: cp.longitude || 75.8573,
          title: `Collection Point ${cp.name || cp.address || 'CP'}`,
          type: 'COLLECTION_POINT',
        });
      }
    }

    res.json(markers);
  } catch (err) { next(err); }
});

module.exports = router;
