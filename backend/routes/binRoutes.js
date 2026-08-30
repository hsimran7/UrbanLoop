const express = require('express');
const { getBins, createBin, updateTelemetry } = require('../controllers/binController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const auditLog = require('../middleware/auditMiddleware');
const { restrictToTenant } = require('../middleware/tenantMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictToTenant);

router.route('/')
  .get(getBins)
  .post(authorize('super_admin', 'municipal_admin', 'ward_manager'), auditLog('CREATE_BIN', 'SmartBin'), createBin);

router.route('/:id/telemetry')
  .put(auditLog('UPDATE_BIN_TELEMETRY', 'SmartBin'), updateTelemetry);

module.exports = router;
