const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { WorkerProfile } = require('../models/Workforce');
const { hashPassword, verifyPassword, generateToken, hashToken } = require('../utils/crypto');
const { log } = require('../utils/audit');
const { protect } = require('../middleware/auth');
const realtimeEventEmitter = require('../sockets/eventEmitter');

const Notification = require('../models/Notification');

// Cookie options — identical to original NestJS getCookieOptions()
function getCookieOptions(isRefresh = false) {
  const maxAge = isRefresh
    ? parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800') * 1000
    : parseInt(process.env.JWT_ACCESS_EXPIRES_IN || '900') * 1000;

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

async function generateTokens(userId, email, role) {
  const payload = { sub: userId.toString(), email, role };

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: `${process.env.JWT_ACCESS_EXPIRES_IN || 900}s`,
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: `${process.env.JWT_REFRESH_EXPIRES_IN || 604800}s`,
  });

  return { accessToken, refreshToken };
}

// POST /api/v1/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, phone, role, employeeCode } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ statusCode: 400, message: 'email, password, and name are required.' });
    }

    const allowedRoles = ['CITIZEN', 'WORKER'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ statusCode: 400, message: 'Public registration is restricted to CITIZEN and WORKER roles.' });
    }

    if (role === 'WORKER' && !employeeCode) {
      return res.status(400).json({ statusCode: 400, message: 'Employee ID is required for worker registration.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ statusCode: 409, message: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);

    if (role === 'WORKER') {
      // Check employee code uniqueness
      const codeExists = await WorkerProfile.findOne({ employeeCode });
      if (codeExists) {
        return res.status(409).json({ statusCode: 409, message: 'Employee code is already registered.' });
      }

      // Worker starts as PENDING and needs admin approval
      const user = await User.create({
        email: email.toLowerCase(),
        passwordHash,
        name,
        phone,
        role: 'WORKER',
        status: 'PENDING',
        emailVerified: false,
      });

      await WorkerProfile.create({
        userId: user._id,
        employeeCode,
        phone: phone || null,
      });

      return res.status(201).json({
        success: true,
        message: 'Worker registration submitted. Pending admin approval.',
      });
    } else {
      // CITIZEN — generate email verification token
      const rawVerificationToken = generateToken();
      const verificationTokenHash = hashToken(rawVerificationToken);
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      const user = await User.create({
        email: email.toLowerCase(),
        passwordHash,
        name,
        phone,
        role: 'CITIZEN',
        status: 'PENDING_VERIFICATION',
        verificationStatus: 'PENDING',
        isActive: false,
        emailVerified: false,
        verificationTokenHash,
        verificationTokenExpires,
      });

      // Emit real-time event to Admin Dashboard
      realtimeEventEmitter.emit('NEW_CITIZEN_REGISTRATION', {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: 'PENDING_VERIFICATION',
        verificationStatus: 'PENDING',
        createdAt: user.createdAt,
      });

      // Create notification for admin users
      try {
        const admins = await User.find({ role: { $in: ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR'] } }).select('_id');
        for (const adminUser of admins) {
          await Notification.create({
            userId: adminUser._id,
            type: 'INFO',
            title: 'New Citizen Registration',
            body: `Citizen ${user.name} (${user.email}) registered and is awaiting verification.`,
          });
        }
      } catch (notifErr) { console.error('Notification creation failed:', notifErr); }

      // Simulate email dispatch
      console.log(`\n==================================================`);
      console.log(`[EMAIL SIMULATION] Verification Email sent to ${email}`);
      console.log(`Verify Link: http://localhost:5173/verify-email?token=${rawVerificationToken}`);
      console.log(`==================================================\n`);

      return res.status(201).json({
        success: true,
        message: 'Registration submitted. Awaiting admin verification.',
        user: {
          id: user._id.toString(),
          email: user.email,
          status: user.status,
          verificationStatus: user.verificationStatus,
        }
      });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ statusCode: 400, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ statusCode: 401, message: 'Invalid email or password.' });
    }

    if (user.status === 'ACTIVE' && user.isActive === false) {
      user.isActive = true;
      await user.save();
    }

    if (user.status === 'PENDING' || user.status === 'PENDING_VERIFICATION') {
      return res.status(401).json({ statusCode: 401, message: 'Your account is pending approval or verification by an administrator.' });
    }

    if (user.status === 'SUSPENDED' || user.status === 'REJECTED' || user.status === 'INACTIVE') {
      return res.status(401).json({ statusCode: 401, message: 'This account is inactive or has been deactivated by an administrator.' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ statusCode: 401, message: 'Invalid email or password.' });
    }

    const tokens = await generateTokens(user._id, user.email, user.role);

    // Save refresh token hash
    const refreshHash = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800') * 1000);

    await RefreshToken.create({
      tokenHash: refreshHash,
      userId: user._id,
      expiresAt,
    });

    await log(user._id.toString(), 'USER_LOGIN', req.ip, req.headers['user-agent'], { email: user.email });

    // Set HttpOnly cookies (same as original)
    res.cookie('accessToken', tokens.accessToken, getCookieOptions(false));
    res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(true));

    const { passwordHash: _, ...userWithoutPassword } = user.toObject();

    return res.status(200).json({
      user: { ...userWithoutPassword, id: user._id.toString() },
      accessToken: tokens.accessToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!rawRefreshToken) {
      return res.status(401).json({ statusCode: 401, message: 'No refresh token provided.' });
    }

    const incomingHash = hashToken(rawRefreshToken);
    const tokenRecord = await RefreshToken.findOne({ tokenHash: incomingHash }).populate('userId');

    if (!tokenRecord) {
      return res.status(401).json({ statusCode: 401, message: 'Invalid refresh token.' });
    }

    // Reuse detection
    if (tokenRecord.revoked) {
      await RefreshToken.updateMany({ userId: tokenRecord.userId }, { revoked: true });
      return res.status(401).json({ statusCode: 401, message: 'Security breach: Token has been reused.' });
    }

    if (new Date() > tokenRecord.expiresAt) {
      await RefreshToken.findByIdAndUpdate(tokenRecord._id, { revoked: true });
      return res.status(401).json({ statusCode: 401, message: 'Refresh token expired.' });
    }

    const user = await User.findById(tokenRecord.userId);
    if (!user) {
      return res.status(401).json({ statusCode: 401, message: 'User not found.' });
    }

    const tokens = await generateTokens(user._id, user.email, user.role);

    const newHash = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800') * 1000);

    const newRecord = await RefreshToken.create({
      tokenHash: newHash,
      userId: user._id,
      expiresAt,
    });

    await RefreshToken.findByIdAndUpdate(tokenRecord._id, {
      revoked: true,
      replacedById: newRecord._id,
    });

    res.cookie('accessToken', tokens.accessToken, getCookieOptions(false));
    res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(true));

    return res.status(200).json({ accessToken: tokens.accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (rawRefreshToken) {
      const incomingHash = hashToken(rawRefreshToken);
      await RefreshToken.updateMany({ tokenHash: incomingHash }, { revoked: true });
    }

    res.clearCookie('accessToken', getCookieOptions(false));
    res.clearCookie('refreshToken', getCookieOptions(true));

    return res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me
router.get('/me', protect, async (req, res) => {
  return res.status(200).json(req.user);
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user) {
      return res.status(200).json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    }

    const rawResetToken = generateToken();
    const passwordResetTokenHash = hashToken(rawResetToken);
    const passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await User.findByIdAndUpdate(user._id, { passwordResetTokenHash, passwordResetExpires });

    console.log(`\n==================================================`);
    console.log(`[EMAIL SIMULATION] Password Reset Email sent to ${email}`);
    console.log(`Reset Link: http://localhost:5173/reset-password?token=${rawResetToken}`);
    console.log(`==================================================\n`);

    return res.status(200).json({ success: true, message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ statusCode: 400, message: 'Token and password are required.' });
    }

    const incomingHash = hashToken(token);
    const user = await User.findOne({ passwordResetTokenHash: incomingHash });

    if (!user) {
      return res.status(400).json({ statusCode: 400, message: 'Invalid or expired reset token.' });
    }

    if (user.passwordResetExpires && new Date() > user.passwordResetExpires) {
      return res.status(400).json({ statusCode: 400, message: 'Invalid or expired reset token.' });
    }

    const newPasswordHash = await hashPassword(password);
    await User.findByIdAndUpdate(user._id, {
      passwordHash: newPasswordHash,
      passwordResetTokenHash: null,
      passwordResetExpires: null,
    });

    await RefreshToken.updateMany({ userId: user._id }, { revoked: true });
    await log(user._id.toString(), 'USER_PASSWORD_RESET', req.ip, req.headers['user-agent'], { email: user.email });

    return res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/verify-email
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ statusCode: 400, message: 'Verification token is required.' });
    }

    const incomingHash = hashToken(token);
    const user = await User.findOne({ verificationTokenHash: incomingHash });

    if (!user) {
      return res.status(400).json({ statusCode: 400, message: 'Invalid verification token.' });
    }

    if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
      return res.status(400).json({ statusCode: 400, message: 'Verification token expired.' });
    }

    await User.findByIdAndUpdate(user._id, {
      emailVerified: true,
      status: 'ACTIVE',
      verificationTokenHash: null,
      verificationTokenExpires: null,
    });

    return res.status(200).json({ success: true, message: 'Email successfully verified.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
