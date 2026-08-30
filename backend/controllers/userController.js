const User = require('../models/User');

// @desc    Get all users (filtered by municipality)
// @route   GET /api/v1/users
// @access  Private
exports.getUsers = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role !== 'super_admin') {
      filter.municipalityId = req.user.municipalityId;
    }
    
    // Add role filtering if provided in query
    if (req.query.role) {
      filter.role = req.query.role;
    }

    const users = await User.find(filter).select('-password');
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user
// @route   GET /api/v1/users/:id
// @access  Private
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Ensure cross-tenant access is blocked
    if (req.user.role !== 'super_admin' && user.municipalityId.toString() !== req.user.municipalityId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this user' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private (Admin only)
exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (req.user.role !== 'super_admin' && user.municipalityId.toString() !== req.user.municipalityId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this user' });
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).select('-password');

    res.status(200).json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
};

// @desc    Create user
// @route   POST /api/v1/users
// @access  Private (Admin only)
exports.createUser = async (req, res, next) => {
  try {
    // If not super_admin, force municipalityId to be the creator's municipalityId
    if (req.user.role !== 'super_admin') {
      req.body.municipalityId = req.user.municipalityId;
    }
    const user = await User.create(req.body);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private (Admin only)
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (req.user.role !== 'super_admin' && user.municipalityId.toString() !== req.user.municipalityId.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this user' });
    }

    await user.deleteOne();

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
