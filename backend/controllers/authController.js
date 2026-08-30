const User = require('../models/User');
const jwt = require('jsonwebtoken');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

const generateTokens = async (user) => {
  const token = user.getSignedJwtToken();
  const refreshToken = user.getRefreshToken();
  user.refreshTokens.push(refreshToken);
  await user.save({ validateBeforeSave: false });
  return { token, refreshToken };
};

const sendTokenResponse = async (user, statusCode, res) => {
  const { token, refreshToken } = await generateTokens(user);

  // Send Welcome Email asynchronously
  sendEmail({
    email: user.email,
    subject: 'Welcome to Smart Waste Management Portal',
    message: `Hello ${user.name},\n\nYour account has been successfully created. Welcome aboard!`
  });

  res.status(201).json({
    success: true,
    token,
    refreshToken,
    data: user
  });
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone, assignedWard, municipalityId } = req.body;
    
    // Default to the first municipality if none provided (for demo purposes)
    let mId = municipalityId;
    if (!mId) {
      const Municipality = require('../models/Municipality');
      const defaultMuni = await Municipality.findOne();
      if (defaultMuni) mId = defaultMuni._id;
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      phone,
      assignedWard,
      municipalityId: mId
    });

    await sendTokenResponse(user, 201, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide an email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Update lastLogin
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });

    const { token, refreshToken } = await generateTokens(user);
    res.status(200).json({ success: true, token, refreshToken, data: user });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh Token
// @route   POST /api/v1/auth/refresh
// @access  Public
exports.refreshToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(403).json({ success: false, error: 'Access denied, token missing!' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret');
    
    const user = await User.findById(decoded.id);
    if (!user || !user.refreshTokens.includes(token)) {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    // Optional: implement token rotation by removing old refresh token
    user.refreshTokens = user.refreshTokens.filter(rt => rt !== token);
    
    const newAccessToken = user.getSignedJwtToken();
    const newRefreshToken = user.getRefreshToken();
    
    user.refreshTokens.push(newRefreshToken);
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
};

// @desc    Logout
// @route   POST /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const user = await User.findById(req.user.id);
      user.refreshTokens = user.refreshTokens.filter(rt => rt !== refreshToken);
      await user.save({ validateBeforeSave: false });
    }
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
