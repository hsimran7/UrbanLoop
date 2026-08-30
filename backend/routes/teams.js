const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { WorkerProfile, CollectionTeam, TeamMembership } = require('../models/Workforce');
const { protect, requireRoles } = require('../middleware/auth');

const ADMIN_ROLES = ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR', 'FACILITY_MANAGER'];

// GET /api/v1/teams
router.get('/', protect, async (req, res, next) => {
  try {
    const teams = await CollectionTeam.find().lean();
    
    // Manually populate supervisors and memberships
    const formattedTeams = await Promise.all(teams.map(async team => {
      let supervisor = null;
      if (team.supervisorId) {
        const supUser = await User.findById(team.supervisorId).lean();
        const supProfile = await WorkerProfile.findOne({ userId: team.supervisorId }).lean();
        if (supUser) {
          supervisor = {
            employeeId: supProfile ? supProfile.employeeCode : '',
            user: { email: supUser.email }
          };
        }
      }

      const memberships = await TeamMembership.find({ teamId: team._id }).lean();
      
      const populatedMemberships = await Promise.all(memberships.map(async m => {
        const workerProfile = await WorkerProfile.findById(m.workerId).lean();
        let workerData = null;
        if (workerProfile) {
          const wUser = await User.findById(workerProfile.userId).lean();
          if (wUser) {
            workerData = {
              employeeCode: workerProfile.employeeCode,
              employeeId: workerProfile.employeeCode,
              user: { email: wUser.email }
            };
          }
        }
        return {
          id: m._id.toString(),
          workerProfileId: m.workerId.toString(),
          workerId: workerProfile ? workerProfile.userId.toString() : null,
          role: m.role,
          effectiveFrom: m.effectiveFrom,
          effectiveUntil: m.effectiveUntil,
          worker: workerData,
        };
      }));

      return {
        id: team._id.toString(),
        name: team.name,
        code: team.code,
        vehicleRegistration: team.vehicleRegistration || null,
        supervisorId: team.supervisorId ? team.supervisorId.toString() : null,
        isActive: team.status === 'ACTIVE',
        supervisor,
        memberships: populatedMemberships,
        _count: { memberships: populatedMemberships.length }
      };
    }));

    res.json(formattedTeams);
  } catch (err) { next(err); }
});

// POST /api/v1/teams
router.post('/', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, vehicleRegistration } = req.body;
    if (!name) return res.status(400).json({ message: 'Team name is required.' });

    const code = `TEAM-${Math.floor(1000 + Math.random() * 9000)}`;
    const team = await CollectionTeam.create({
      name,
      code,
      vehicleRegistration: vehicleRegistration || null,
      status: 'ACTIVE'
    });

    res.status(201).json({ success: true, team });
  } catch (err) { next(err); }
});

// POST /api/v1/teams/:id/members
router.post('/:id/members', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { workerId, role, effectiveFrom } = req.body;
    if (!workerId || !role) return res.status(400).json({ message: 'workerId and role are required.' });

    // workerId sent from frontend is the User ID.
    // We need to find the WorkerProfile for this User.
    const workerProfile = await WorkerProfile.findOne({ userId: workerId });
    if (!workerProfile) return res.status(404).json({ message: 'Worker profile not found for this user.' });

    const team = await CollectionTeam.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found.' });

    const membership = await TeamMembership.create({
      teamId: team._id,
      workerId: workerProfile._id,
      role,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date()
    });

    res.status(201).json({ success: true, membership });
  } catch (err) { next(err); }
});

// PATCH /api/v1/teams/:id/supervisor
router.patch('/:id/supervisor', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { supervisorId } = req.body;
    const team = await CollectionTeam.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found.' });

    team.supervisorId = supervisorId || null;
    await team.save();

    res.json({ success: true, team });
  } catch (err) { next(err); }
});

// DELETE /api/v1/teams/memberships/:id
router.delete('/memberships/:id', protect, requireRoles(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const membership = await TeamMembership.findById(req.params.id);
    if (!membership) return res.status(404).json({ message: 'Membership not found.' });

    // Mark as inactive instead of hard delete, or just delete it.
    // Frontend just expects it to be gone.
    await TeamMembership.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Membership removed.' });
  } catch (err) { next(err); }
});

module.exports = router;
