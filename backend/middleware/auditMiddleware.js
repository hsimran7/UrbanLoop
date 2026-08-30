const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

/**
 * Middleware to log actions in the database.
 * @param {String} action - Action being performed (e.g., 'UPDATE_BIN')
 * @param {String} entityType - Model name (e.g., 'SmartBin')
 */
const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    // We want to capture the old value before the controller modifies it.
    // This implies we either fetch it here, or we let the controller do the audit.
    // For simplicity, we can hook into res.on('finish') if we want to log that an action occurred,
    // but capturing old/new requires deep integration with mongoose or controllers.
    
    // A simplified generic approach:
    res.on('finish', async () => {
      // Only log successful mutating actions
      if (res.statusCode >= 200 && res.statusCode < 300 && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        try {
          await AuditLog.create({
            municipalityId: req.user ? req.user.municipalityId : (req.body.municipalityId || null),
            userId: req.user ? req.user._id : null,
            action,
            entityType,
            entityId: req.params.id || null, // Best effort generic extraction
            ipAddress: req.ip,
            device: req.headers['user-agent']
          });
        } catch (err) {
          logger.error(`Audit logging failed: ${err.message}`);
        }
      }
    });
    
    next();
  };
};

module.exports = auditLog;
