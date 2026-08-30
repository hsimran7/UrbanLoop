const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * JWT Auth middleware — reads from HttpOnly cookie or Authorization Bearer header.
 * Identical to original NestJS JwtAuthGuard + JwtStrategy behavior.
 */
const protect = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check HttpOnly cookie (preferred, same as original)
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    // 2. Fallback: Authorization Bearer header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    if (!token) {
      return res.status(401).json({ statusCode: 401, message: 'Unauthorized: No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Load user from DB (same as original which loads user in JwtStrategy)
    const user = await User.findById(decoded.sub).lean();
    if (!user) {
      return res.status(401).json({ statusCode: 401, message: 'Unauthorized: User not found.' });
    }

    const isAccountActive = user.status === 'ACTIVE' || (user.isActive === true && user.status !== 'SUSPENDED' && user.status !== 'REJECTED' && user.status !== 'INACTIVE');
    if (!isAccountActive) {
      return res.status(403).json({ statusCode: 403, message: 'Forbidden: Account has been deactivated or suspended by an administrator.' });
    }

    // Attach user to request (same shape as original NestJS @GetUser())
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      name: user.name,
      phone: user.phone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ statusCode: 401, message: 'Unauthorized: Token expired.' });
    }
    return res.status(401).json({ statusCode: 401, message: 'Unauthorized: Invalid token.' });
  }
};

/**
 * RBAC guard — checks that req.user.role is in the allowed roles array.
 * Same as original NestJS @Roles() + RolesGuard.
 */
const requireRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        statusCode: 403,
        message: `Forbidden: Role '${req.user.role}' is not authorized.`,
      });
    }
    next();
  };
};

module.exports = { protect, requireRoles };
