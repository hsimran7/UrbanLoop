const express = require('express');
const { getAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { restrictToTenant } = require('../middleware/tenantMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictToTenant);

router.route('/')
  .get(authorize('super_admin', 'municipal_admin', 'ward_manager'), getAnalytics);

module.exports = router;
