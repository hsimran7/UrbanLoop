const Analytics = require('../models/Analytics');

// @desc    Get historical analytics
// @route   GET /api/v1/analytics
// @access  Private (Admin/Manager)
exports.getAnalytics = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'super_admin') {
      filter.municipalityId = req.user.municipalityId;
    }

    const analytics = await Analytics.find(filter).sort({ date: -1 }).limit(30);
    res.status(200).json({ success: true, count: analytics.length, data: analytics });
  } catch (error) {
    next(error);
  }
};
