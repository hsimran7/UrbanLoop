const express = require('express');
const router = express.Router();
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Property = require('../models/Property');
const CollectionPoint = require('../models/CollectionPoint');
const Bin = require('../models/Bin');
const Notification = require('../models/Notification');
const { protect, requireRoles } = require('../middleware/auth');
const realtimeEventEmitter = require('../sockets/eventEmitter');

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR', 'FACILITY_MANAGER'];

// GET /api/v1/users — Get all users with optional status & role filtering (Admin only)
router.get('/', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.role) filter.role = req.query.role;

    const users = await User.find(filter).sort({ createdAt: -1 }).lean();
    res.json(users.map(u => ({
      ...u,
      id: u._id.toString(),
      verificationStatus: u.verificationStatus || (u.status === 'ACTIVE' ? 'VERIFIED' : 'PENDING'),
      isActive: u.isActive ?? (u.status === 'ACTIVE'),
    })));
  } catch (err) { next(err); }
});

// GET /api/v1/users/pending — Quick access to pending user registrations
router.get('/pending', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const users = await User.find({
      $or: [
        { status: { $in: ['PENDING', 'PENDING_VERIFICATION'] } },
        { verificationStatus: 'PENDING' }
      ]
    }).sort({ createdAt: -1 }).lean();
    res.json(users.map(u => ({
      ...u,
      id: u._id.toString(),
      verificationStatus: u.verificationStatus || 'PENDING',
      isActive: u.isActive ?? false,
    })));
  } catch (err) { next(err); }
});

// POST /api/v1/users/:id/verify — Admin verify citizen
router.post('/:id/verify', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.status = 'ACTIVE';
    user.verificationStatus = 'VERIFIED';
    user.isActive = true;
    user.emailVerified = true;
    await user.save();

    const userIdStr = user._id.toString();

    realtimeEventEmitter.emit('CITIZEN_VERIFIED', {
      userId: userIdStr,
      email: user.email,
      role: user.role,
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      isActive: true,
      timestamp: new Date().toISOString(),
    });

    realtimeEventEmitter.emit('citizenVerified', {
      userId: userIdStr,
      email: user.email,
      role: user.role,
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      isActive: true,
      timestamp: new Date().toISOString(),
    });

    try {
      await Notification.create({
        userId: user._id,
        type: 'INFO',
        title: 'Account Verified',
        body: 'Your citizen account has been verified by the municipal authority. You can now access full portal services.',
      });
    } catch (notifErr) { console.error('Notification creation failed:', notifErr); }

    res.json({
      success: true,
      message: 'Citizen verified successfully.',
      user: {
        id: userIdStr,
        status: user.status,
        verificationStatus: user.verificationStatus,
        isActive: user.isActive,
      }
    });
  } catch (err) { next(err); }
});

// POST /api/v1/users/:id/reject — Admin reject citizen
router.post('/:id/reject', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.status = 'REJECTED';
    user.verificationStatus = 'REJECTED';
    user.isActive = false;
    await user.save();

    const userIdStr = user._id.toString();

    realtimeEventEmitter.emit('CITIZEN_REJECTED', {
      userId: userIdStr,
      email: user.email,
      role: user.role,
      status: 'REJECTED',
      verificationStatus: 'REJECTED',
      isActive: false,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Citizen registration rejected.',
      user: {
        id: userIdStr,
        status: user.status,
        verificationStatus: user.verificationStatus,
        isActive: user.isActive,
      }
    });
  } catch (err) { next(err); }
});

// PATCH /api/v1/users/:id/status — Status toggle
router.patch('/:id/status', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { status } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    user.status = status;
    if (status === 'ACTIVE') {
      user.verificationStatus = 'VERIFIED';
      user.isActive = true;
    } else if (status === 'SUSPENDED' || status === 'REJECTED') {
      user.isActive = false;
    }
    await user.save();

    const userIdStr = user._id.toString();

    if (status === 'SUSPENDED') {
      await RefreshToken.deleteMany({ userId: user._id });
      realtimeEventEmitter.emit('accountDeactivated', { userId: userIdStr, email: user.email, timestamp: new Date().toISOString() });
    } else if (status === 'ACTIVE') {
      realtimeEventEmitter.emit('CITIZEN_VERIFIED', { userId: userIdStr, email: user.email, role: user.role, status: 'ACTIVE', verificationStatus: 'VERIFIED', isActive: true });
    }

    res.json({ success: true, user: { id: userIdStr, status: user.status, verificationStatus: user.verificationStatus, isActive: user.isActive } });
  } catch (err) { next(err); }
});

// GET /api/v1/users/:id/details — Full Citizen Details (Profile, Property & Bins for Admin)
router.get('/:id/details', protect, async (req, res, next) => {
  try {
    // Security check: Citizen can only view own details, Admin can view any
    if (req.user.role === 'CITIZEN' && req.user.id !== req.params.id) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Fetch user's registered properties
    const properties = await Property.find({ ownerId: user._id })
      .populate({ path: 'areaId', populate: { path: 'wardId', populate: { path: 'cityId', populate: 'districtId' } } })
      .lean();

    const propIds = properties.map(p => p._id);
    const collectionPoints = await CollectionPoint.find({ propertyId: { $in: propIds } }).lean();
    const cpIds = collectionPoints.map(cp => cp._id);
    const bins = await Bin.find({ collectionPointId: { $in: cpIds } }).lean();

    res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        verificationStatus: user.verificationStatus || (user.status === 'ACTIVE' ? 'VERIFIED' : 'PENDING'),
        isActive: user.isActive ?? (user.status === 'ACTIVE'),
      },
      properties: properties.map(p => ({
        id: p._id.toString(),
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        status: p.status,
        area: p.areaId?.name,
        ward: p.areaId?.wardId?.name || p.areaId?.wardId?.number,
        city: p.areaId?.wardId?.cityId?.name,
        district: p.areaId?.wardId?.cityId?.districtId?.name,
      })),
      bins: bins.map(b => ({
        id: b._id.toString(),
        qrCodeId: b.qrCodeId,
        type: b.type,
        status: b.status,
        fillLevel: b.fillLevel,
        lastEmptiedAt: b.lastEmptiedAt,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/v1/users/:id
router.get('/:id', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      ...user,
      id: user._id.toString(),
      verificationStatus: user.verificationStatus || (user.status === 'ACTIVE' ? 'VERIFIED' : 'PENDING'),
      isActive: user.isActive ?? (user.status === 'ACTIVE'),
    });
  } catch (err) { next(err); }
});

module.exports = router;
