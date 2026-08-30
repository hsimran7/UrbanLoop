const express = require('express');
const { getUsers, getUser, updateUser, createUser, deleteUser } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const auditLog = require('../middleware/auditMiddleware');
const { restrictToTenant } = require('../middleware/tenantMiddleware');

const router = express.Router();

// All user routes require authentication
router.use(protect);
router.use(restrictToTenant);

router.route('/')
  .get(authorize('super_admin', 'municipal_admin', 'ward_manager'), getUsers)
  .post(authorize('super_admin', 'municipal_admin'), auditLog('CREATE_USER', 'User'), createUser);

router.route('/:id')
  .get(getUser)
  .put(authorize('super_admin', 'municipal_admin'), auditLog('UPDATE_USER', 'User'), updateUser)
  .delete(authorize('super_admin', 'municipal_admin'), auditLog('DELETE_USER', 'User'), deleteUser);

module.exports = router;
