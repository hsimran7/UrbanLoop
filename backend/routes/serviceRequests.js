const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Notification = require('../models/Notification');
const { ServiceRequest, ServiceRequestCategory, ServiceRequestAction } = require('../models/ServiceRequest');
const { protect, requireRoles } = require('../middleware/auth');
const realtimeEventEmitter = require('../sockets/eventEmitter');
const mongoose = require('mongoose');

// GET /api/v1/service-requests (Admin views all complaints, Citizen views own complaints)
router.get('/', protect, async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'CITIZEN') {
      filter.createdByUserId = req.user.id;
    }

    const requests = await ServiceRequest.find(filter)
      .populate('createdByUserId', 'name email')
      .populate('categoryId', 'name')
      .populate('areaId', 'name')
      .sort({ submittedAt: -1 })
      .lean();
    
    // Map to expected frontend format
    const formatted = requests.map(r => ({
      id: r._id.toString(),
      requestCode: r.requestCode,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      categoryName: r.categoryId?.name,
      areaName: r.areaId?.name,
      citizenName: r.createdByUserId?.name || 'Anonymous',
      submittedAt: r.submittedAt,
    }));
    res.json(formatted);
  } catch (err) { next(err); }
});

// GET /api/v1/service-requests/dashboard (Admin dashboard stats)
router.get('/dashboard', protect, async (req, res, next) => {
  try {
    const totalActive = await ServiceRequest.countDocuments({ status: { $in: ['SUBMITTED', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS'] } });
    const pending = await ServiceRequest.countDocuments({ status: 'SUBMITTED' });
    const inProgress = await ServiceRequest.countDocuments({ status: 'IN_PROGRESS' });
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const resolvedToday = await ServiceRequest.countDocuments({ status: 'RESOLVED', resolvedAt: { $gte: startOfToday } });
    
    res.json({
      kpis: { totalActive, pending, inProgress, resolvedToday },
      recent: [],
      categoryStats: []
    });
  } catch (err) { next(err); }
});

// GET /api/v1/service-requests/my-requests (Citizen portal)
router.get('/my-requests', protect, async (req, res, next) => {
  try {
    const requests = await ServiceRequest.find({ createdByUserId: req.user.id })
      .populate('categoryId', 'name')
      .populate('areaId', 'name')
      .sort({ submittedAt: -1 })
      .lean();
      
    res.json(requests.map(r => ({
      id: r._id.toString(),
      requestCode: r.requestCode,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      categoryName: r.categoryId?.name,
      areaName: r.areaId?.name,
      submittedAt: r.submittedAt,
    })));
  } catch (err) { next(err); }
});

// POST /api/v1/service-requests (Citizen submits complaint)
router.post('/', protect, async (req, res, next) => {
  try {
    const { categoryId, areaId, title, description, priority, latitude, longitude } = req.body;
    
    // Create new service request
    const request = await ServiceRequest.create({
      requestCode: `SR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdByUserId: req.user.id,
      categoryId: categoryId || new mongoose.Types.ObjectId(), // mocked if not provided
      areaId: areaId || new mongoose.Types.ObjectId(), // mocked if not provided
      title,
      description,
      priority: priority || 'NORMAL',
      status: 'SUBMITTED',
      latitude: latitude || null,
      longitude: longitude || null,
    });
    
    // Emit socket event for Admin dashboard
    realtimeEventEmitter.emit('NEW_CITIZEN_REQUEST', {
      id: request._id.toString(),
      requestCode: request.requestCode,
      title: request.title,
      description: request.description,
      status: request.status,
      citizenId: req.user.id,
      citizenName: req.user.name || 'Citizen',
      timestamp: new Date().toISOString()
    });

    realtimeEventEmitter.emit('complaintSubmitted', {
      id: request._id.toString(),
      requestCode: request.requestCode,
      title: request.title,
      status: request.status,
      citizenId: req.user.id,
      timestamp: new Date().toISOString()
    });

    try {
      const admins = await User.find({ role: { $in: ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR'] } }).select('_id');
      for (const adminUser of admins) {
        await Notification.create({
          userId: adminUser._id,
          type: 'INFO',
          title: 'New Citizen Request',
          body: `Request ${request.requestCode} "${request.title}" submitted by ${req.user.name || 'Citizen'}.`,
        });
      }
    } catch (notifErr) { console.error('Notification creation failed:', notifErr); }

    res.json({ success: true, message: 'Request submitted successfully.', request: { id: request._id.toString() } });
  } catch (err) { next(err); }
});

// PATCH /api/v1/service-requests/:id/status (Admin updates complaint status)
router.patch('/:id/status', protect, requireRoles('SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR', 'FACILITY_MANAGER'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found.' });

    request.status = status;
    if (status === 'RESOLVED') request.resolvedAt = new Date();
    if (status === 'CLOSED') request.closedAt = new Date();
    if (status === 'IN_PROGRESS') request.workStartedAt = new Date();
    
    await request.save();

    // Emit socket event so Citizen Dashboard updates
    const citizenIdStr = request.createdByUserId?.toString();
    realtimeEventEmitter.emit('SERVICE_REQUEST_UPDATED', {
      id: request._id.toString(),
      requestCode: request.requestCode,
      status: request.status,
      citizenId: citizenIdStr,
      timestamp: new Date().toISOString()
    });

    realtimeEventEmitter.emit('complaintUpdated', {
      id: request._id.toString(),
      requestCode: request.requestCode,
      status: request.status,
      citizenId: citizenIdStr,
      timestamp: new Date().toISOString()
    });

    try {
      if (request.createdByUserId) {
        await Notification.create({
          userId: request.createdByUserId,
          type: 'INFO',
          title: 'Service Request Status Updated',
          body: `Your request ${request.requestCode} status was updated to ${request.status}.`,
        });
      }
    } catch (notifErr) { console.error('Notification creation failed:', notifErr); }

    res.json({ success: true, request: { id: request._id.toString(), status: request.status } });
  } catch (err) { next(err); }
});

// GET /api/v1/service-requests/categories
router.get('/categories', protect, async (req, res, next) => {
  try {
    const categories = await ServiceRequestCategory.find().lean();
    res.json(categories.map(c => ({ ...c, id: c._id.toString() })));
  } catch (err) { next(err); }
});

// Helper for status transitions
async function updateRequestStatus(reqId, newStatus, extraFields = {}, req, res, next) {
  try {
    const request = await ServiceRequest.findById(reqId);
    if (!request) return res.status(404).json({ message: 'Request not found.' });

    request.status = newStatus;
    Object.assign(request, extraFields);
    await request.save();

    const citizenIdStr = request.createdByUserId?.toString();
    realtimeEventEmitter.emit('SERVICE_REQUEST_UPDATED', {
      id: request._id.toString(),
      requestCode: request.requestCode,
      status: request.status,
      citizenId: citizenIdStr,
      timestamp: new Date().toISOString()
    });
    realtimeEventEmitter.emit('complaintUpdated', {
      id: request._id.toString(),
      requestCode: request.requestCode,
      status: request.status,
      citizenId: citizenIdStr,
      timestamp: new Date().toISOString()
    });

    try {
      if (request.createdByUserId) {
        await Notification.create({
          userId: request.createdByUserId,
          type: 'INFO',
          title: 'Service Request Status Updated',
          body: `Your request ${request.requestCode} status was updated to ${request.status}.`,
        });
      }
    } catch (notifErr) {}

    res.json({ success: true, request: { id: request._id.toString(), status: request.status } });
  } catch (err) { next(err); }
}

router.post('/:id/triage', protect, requireRoles('SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR', 'FACILITY_MANAGER'), (req, res, next) => {
  updateRequestStatus(req.params.id, 'TRIAGED', { priority: req.body.priority || 'NORMAL' }, req, res, next);
});

router.post('/:id/assign', protect, requireRoles('SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR', 'FACILITY_MANAGER'), (req, res, next) => {
  updateRequestStatus(req.params.id, 'ASSIGNED', { assignedToUserId: req.body.assignedToUserId || req.body.workerId }, req, res, next);
});

router.post('/:id/start', protect, (req, res, next) => {
  updateRequestStatus(req.params.id, 'IN_PROGRESS', { workStartedAt: new Date() }, req, res, next);
});

router.post('/:id/request-information', protect, (req, res, next) => {
  updateRequestStatus(req.params.id, 'NEEDS_INFO', {}, req, res, next);
});

router.post('/:id/resolve', protect, (req, res, next) => {
  updateRequestStatus(req.params.id, 'RESOLVED', { resolvedAt: new Date(), resolutionNotes: req.body.notes }, req, res, next);
});

router.post('/:id/close', protect, (req, res, next) => {
  updateRequestStatus(req.params.id, 'CLOSED', { closedAt: new Date() }, req, res, next);
});

router.post('/:id/cancel', protect, (req, res, next) => {
  updateRequestStatus(req.params.id, 'CANCELLED', {}, req, res, next);
});

router.get('/:id/comments', protect, async (req, res, next) => {
  res.json([]);
});

router.post('/:id/comments', protect, async (req, res, next) => {
  res.json({ success: true, comment: { id: `c-${Date.now()}`, text: req.body.text, createdAt: new Date().toISOString() } });
});

// GET /api/v1/service-requests/:id
router.get('/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Invalid ID format.' });
    }
    const request = await ServiceRequest.findById(req.params.id)
      .populate('createdByUserId', 'name email phone')
      .populate('categoryId', 'name')
      .populate('areaId', 'name')
      .lean();
      
    if (!request) return res.status(404).json({ message: 'Not found' });
    res.json(request);
  } catch (err) { next(err); }
});

module.exports = router;
