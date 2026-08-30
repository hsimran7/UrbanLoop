const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { WorkerProfile, CollectionTeam } = require('../models/Workforce');
const { Shift } = require('../models/Shift');
const { hashPassword } = require('../utils/crypto');
const { protect, requireRoles } = require('../middleware/auth');
const realtimeEventEmitter = require('../sockets/eventEmitter');

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR', 'FACILITY_MANAGER'];

// GET /api/v1/workforce/workers — List all workers with populated user details
router.get('/workers', protect, async (req, res, next) => {
  try {
    const workerUsers = await User.find({
      role: { $in: ['WORKER', 'DRIVER', 'SUPERVISOR', 'worker', 'driver', 'supervisor'] }
    }).lean();

    const userIds = workerUsers.map(u => u._id);
    const profiles = await WorkerProfile.find({ userId: { $in: userIds } }).lean();

    const formatted = workerUsers.map(u => {
      const profile = profiles.find(p => p.userId?.toString() === u._id.toString());
      return {
        id: u._id.toString(),
        userId: u._id.toString(),
        name: u.name || u.email.split('@')[0],
        email: u.email,
        phone: u.phone || profile?.phone || 'N/A',
        role: u.role,
        status: u.status || 'ACTIVE',
        employeeCode: profile?.employeeCode || `EMP-${u._id.toString().substring(18)}`,
        employmentStatus: profile?.employmentStatus || 'ACTIVE',
        specializations: profile?.specializations || [],
        joinedAt: profile?.joinedAt || u.createdAt,
      };
    });

    res.json(formatted);
  } catch (err) { next(err); }
});

// GET /api/v1/workforce/workers/:id
router.get('/workers/:id', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: 'Worker not found.' });

    const profile = await WorkerProfile.findOne({ userId: user._id }).lean();
    res.json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      employeeCode: profile?.employeeCode,
      employmentStatus: profile?.employmentStatus,
      specializations: profile?.specializations || [],
    });
  } catch (err) { next(err); }
});

// POST /api/v1/workforce/workers — Admin register / invite worker
router.post('/workers', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { email, password, role, employeeCode, phone, specializations } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    const code = employeeCode || `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    const existingCode = await WorkerProfile.findOne({ employeeCode: code });
    if (existingCode) {
      return res.status(409).json({ message: 'Employee code is already registered.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      name: email.split('@')[0],
      phone: phone || null,
      role: role || 'WORKER',
      status: 'ACTIVE',
      emailVerified: true,
    });

    const profile = await WorkerProfile.create({
      userId: user._id,
      employeeCode: code,
      phone: phone || null,
      employmentStatus: 'ACTIVE',
      specializations: specializations || [],
      joinedAt: new Date(),
    });

    realtimeEventEmitter.emit('workerShiftStarted', {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      status: 'ACTIVE',
    });

    res.status(201).json({
      success: true,
      message: 'Worker registered successfully.',
      worker: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        employeeCode: profile.employeeCode,
      },
    });
  } catch (err) { next(err); }
});

// PATCH /api/v1/workforce/workers/:id/status — Admin update worker status
router.patch('/workers/:id/status', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { status, employmentStatus } = req.body;
    const targetStatus = status || employmentStatus || 'ACTIVE';

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Worker not found.' });

    user.status = targetStatus;
    user.isActive = (targetStatus === 'ACTIVE');
    await user.save();

    await WorkerProfile.findOneAndUpdate(
      { userId: user._id },
      { employmentStatus: targetStatus },
      { upsert: true }
    );

    const userIdStr = user._id.toString();

    if (!user.isActive) {
      await RefreshToken.deleteMany({ userId: user._id });
      realtimeEventEmitter.emit('accountDeactivated', {
        userId: userIdStr,
        email: user.email,
        timestamp: new Date().toISOString(),
      });
    } else {
      realtimeEventEmitter.emit('WORKER_ACTIVATED', {
        userId: userIdStr,
        email: user.email,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: `Worker status updated to ${targetStatus}`,
      worker: { id: userIdStr, status: user.status, isActive: user.isActive },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/workforce/workers/:id/approve — Approve worker
router.post('/workers/:id/approve', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Worker not found.' });

    user.status = 'ACTIVE';
    user.isActive = true;
    await user.save();

    await WorkerProfile.findOneAndUpdate({ userId: user._id }, { employmentStatus: 'ACTIVE' });

    res.json({ success: true, message: 'Worker approved successfully.' });
  } catch (err) { next(err); }
});

// GET /api/v1/workforce/teams
router.get('/teams', protect, async (req, res, next) => {
  try {
    const teams = await CollectionTeam.find().lean();
    res.json(teams.map(t => ({ ...t, id: t._id.toString() })));
  } catch (err) { next(err); }
});

// GET /api/v1/workforce/shifts
router.get('/shifts', protect, async (req, res, next) => {
  try {
    const shifts = await Shift.find().lean();
    res.json(shifts.map(s => ({ ...s, id: s._id.toString() })));
  } catch (err) { next(err); }
});

module.exports = router;
