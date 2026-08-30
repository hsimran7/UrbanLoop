const express = require('express');
const { getRoutes, createRoute, updateRoute } = require('../controllers/routeController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const auditLog = require('../middleware/auditMiddleware');
const { restrictToTenant } = require('../middleware/tenantMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictToTenant);

router.route('/')
  .get(getRoutes)
  .post(authorize('super_admin', 'municipal_admin', 'ward_manager'), auditLog('CREATE_ROUTE', 'Route'), createRoute);

router.route('/:id')
  .put(authorize('super_admin', 'municipal_admin', 'ward_manager'), auditLog('UPDATE_ROUTE', 'Route'), updateRoute);

module.exports = router;
