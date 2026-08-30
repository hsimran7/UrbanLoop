const express = require('express');
const { getVehicles, createVehicle, updateLocation } = require('../controllers/vehicleController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const auditLog = require('../middleware/auditMiddleware');
const { restrictToTenant } = require('../middleware/tenantMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictToTenant);

router.route('/')
  .get(getVehicles)
  .post(authorize('super_admin', 'municipal_admin', 'ward_manager'), auditLog('CREATE_VEHICLE', 'Vehicle'), createVehicle);

router.route('/:id/location')
  .put(auditLog('UPDATE_VEHICLE_LOCATION', 'Vehicle'), updateLocation);

module.exports = router;
