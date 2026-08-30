const User = require('../models/User');
const SmartBin = require('../models/SmartBin');
const Vehicle = require('../models/Vehicle');
const Route = require('../models/Route');
const Complaint = require('../models/Complaint');
const Collection = require('../models/Collection');

// @desc    Get dashboard statistics
// @route   GET /api/v1/dashboard/stats
// @access  Private (Admin/Manager)
exports.getStats = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'super_admin') {
      filter.municipalityId = req.user.municipalityId;
    }

    const [
      totalCitizens,
      totalWorkers,
      activeVehicles,
      activeRoutes,
      overflowingBins,
      pendingComplaints
    ] = await Promise.all([
      User.countDocuments({ ...filter, role: 'citizen' }),
      User.countDocuments({ ...filter, role: 'worker' }),
      Vehicle.countDocuments({ ...filter, status: 'active' }),
      Route.countDocuments({ ...filter, status: 'active' }),
      SmartBin.countDocuments({ ...filter, isOverflowing: true }),
      Complaint.countDocuments({ ...filter, status: { $in: ['open', 'in_progress'] } })
    ]);

    // Aggregate today's collections
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const collectionsToday = await Collection.countDocuments({
      ...filter,
      completedAt: { $gte: today }
    });

    res.status(200).json({
      success: true,
      data: {
        totalCitizens,
        totalWorkers,
        activeVehicles,
        activeRoutes,
        overflowingBins,
        pendingComplaints,
        collectionsToday
      }
    });
  } catch (error) {
    next(error);
  }
};
