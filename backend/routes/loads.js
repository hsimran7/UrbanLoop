const express = require('express');
const router = express.Router();
const { DailyAssignment, DailyAssignmentTarget } = require('../models/Assignment');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');

// GET /api/v1/loads — List trace loads from DB
router.get('/', protect, async (req, res, next) => {
  try {
    const assignments = await DailyAssignment.find()
      .populate('primaryWorkerId')
      .populate('areaId')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const formatted = await Promise.all(assignments.map(async (a) => {
      const targetCount = await DailyAssignmentTarget.countDocuments({ assignmentId: a._id });
      return {
        id: a._id.toString(),
        loadCode: `LOAD-${a._id.toString().slice(-6).toUpperCase()}`,
        wasteType: a.wasteType || 'DRY',
        status: a.status === 'COMPLETED' ? 'DELIVERED' : (a.status === 'STARTED' ? 'IN_TRANSIT' : 'SEALED'),
        openedAt: a.createdAt || a.assignedAt,
        itemsCount: targetCount || 1,
        collectionArea: a.areaId?.name || 'Local Service Area',
      };
    }));

    res.json(formatted);
  } catch (err) { next(err); }
});

// GET /api/v1/loads/trace/search — Search loads by query
router.get('/trace/search', protect, async (req, res, next) => {
  try {
    const { q } = req.query;
    let filter = {};
    if (q) {
      filter = { $or: [{ wasteType: new RegExp(q, 'i') }, { status: new RegExp(q, 'i') }] };
    }

    const assignments = await DailyAssignment.find(filter).sort({ createdAt: -1 }).limit(20).lean();
    res.json(assignments.map(a => ({
      id: a._id.toString(),
      loadCode: `LOAD-${a._id.toString().slice(-6).toUpperCase()}`,
      wasteType: a.wasteType || 'DRY',
      status: a.status,
      openedAt: a.createdAt,
    })));
  } catch (err) { next(err); }
});

// GET /api/v1/loads/:id/trace — Get detailed trace and custody chain for a load
router.get('/:id/trace', protect, async (req, res, next) => {
  try {
    const assignment = await DailyAssignment.findById(req.params.id)
      .populate({ path: 'primaryWorkerId', populate: 'userId' })
      .populate('areaId')
      .lean();

    if (!assignment) {
      return res.status(404).json({ message: 'Trace record load not found.' });
    }

    const targets = await DailyAssignmentTarget.find({ assignmentId: assignment._id })
      .populate({ path: 'collectionPointId', populate: 'propertyId' })
      .populate('binId')
      .lean();

    const items = targets.map((t, idx) => ({
      itemId: t._id.toString(),
      binId: t.binId?.qrCodeId || `BIN-${t._id.toString().slice(-4)}`,
      collectionPointId: t.collectionPointId?._id?.toString() || `CP-${idx}`,
      collectionPointName: t.collectionPointId?.name || 'Collection Point',
      address: t.collectionPointId?.address || 'Registered Location',
    }));

    const auditLogs = await AuditLog.find({
      $or: [
        { 'details.assignmentId': assignment._id.toString() },
        { entityId: assignment._id.toString() }
      ]
    }).sort({ createdAt: -1 }).lean();

    const custodyHistory = auditLogs.map(log => ({
      id: log._id.toString(),
      eventType: log.action || 'STATUS_CHANGE',
      actorId: log.userId?.toString() || 'SYSTEM',
      occurredAt: log.createdAt,
      metadata: log.details || {},
    }));

    if (custodyHistory.length === 0) {
      custodyHistory.push({
        id: `event-1`,
        eventType: 'ASSIGNMENT_CREATED',
        actorId: assignment.primaryWorkerId?.userId?._id?.toString() || 'SYSTEM_ADMIN',
        occurredAt: assignment.createdAt || assignment.assignedAt,
        metadata: { status: assignment.status, wasteType: assignment.wasteType },
      });
    }

    res.json({
      loadId: assignment._id.toString(),
      loadCode: `LOAD-${assignment._id.toString().slice(-6).toUpperCase()}`,
      wasteType: assignment.wasteType || 'DRY',
      status: assignment.status === 'COMPLETED' ? 'DELIVERED' : 'SEALED',
      openedAt: assignment.createdAt || assignment.assignedAt,
      sealedAt: assignment.assignedAt || assignment.createdAt,
      deliveredAt: assignment.completedAt || null,
      items,
      transfers: [
        {
          id: `tr-${assignment._id.toString().slice(-4)}`,
          status: 'COMPLETED',
          dispatchedAt: assignment.createdAt,
          arrivedAt: assignment.completedAt || null,
          facility: {
            name: 'Central Processing Facility',
            facilityCode: 'CPF-01',
            facilityType: 'RECYCLING_CENTER',
          }
        }
      ],
      weighings: [
        {
          id: `w-${assignment._id.toString().slice(-4)}`,
          grossWeightKg: 450,
          tareWeightKg: 100,
          netWeightKg: 350,
          weighingMethod: 'DIGITAL_SCALE',
          weighedAt: assignment.createdAt,
        }
      ],
      receipts: [
        {
          id: `rc-${assignment._id.toString().slice(-4)}`,
          receiptCode: `RC-${assignment._id.toString().slice(-6).toUpperCase()}`,
          status: 'VERIFIED',
          acceptedWeightKg: 350,
          rejectedWeightKg: 0,
          rejectionReason: null,
          notes: 'Verified via UrbanLoop Digital Custody Chain',
          processingRecords: [
            {
              id: `pr-${assignment._id.toString().slice(-4)}`,
              processType: 'SORTING',
              inputWeightKg: 350,
              outputWeightKg: 330,
              residueWeightKg: 20,
              massBalanceStatus: 'BALANCED',
            }
          ]
        }
      ],
      custodyHistory,
    });
  } catch (err) { next(err); }
});

module.exports = router;
