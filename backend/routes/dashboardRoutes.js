const express = require('express');
const { getStats } = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { restrictToTenant } = require('../middleware/tenantMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictToTenant);

router.route('/stats')
  .get(authorize('super_admin', 'municipal_admin', 'ward_manager'), getStats);

module.exports = router;
