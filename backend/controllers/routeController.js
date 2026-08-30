const Route = require('../models/Route');

// @desc    Get all routes
// @route   GET /api/v1/routes
// @access  Private
exports.getRoutes = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'super_admin') {
      filter.municipalityId = req.user.municipalityId;
    }
    
    // Workers see their assigned routes
    if (req.user.role === 'worker') {
      filter.assignedWorker = req.user._id;
    }

    const routes = await Route.find(filter).populate('assignedVehicle').populate('assignedWorker').populate('bins');
    res.status(200).json({ success: true, count: routes.length, data: routes });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new route
// @route   POST /api/v1/routes
// @access  Private (Admin/Manager)
exports.createRoute = async (req, res, next) => {
  try {
    const route = await Route.create(req.body);
    res.status(201).json({ success: true, data: route });
  } catch (error) {
    next(error);
  }
};

// @desc    Update route details
// @route   PUT /api/v1/routes/:id
// @access  Private (Admin/Manager)
exports.updateRoute = async (req, res, next) => {
  try {
    let route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    route = await Route.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ success: true, data: route });
  } catch (error) {
    next(error);
  }
};
