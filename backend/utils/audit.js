const AuditLog = require('../models/AuditLog');

/**
 * Audit logging service — mirrors original NestJS AuditService
 */
async function log(userId, action, ipAddress, userAgent, details) {
  try {
    await AuditLog.create({
      userId: userId || null,
      action,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      details: details || null,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { log };
