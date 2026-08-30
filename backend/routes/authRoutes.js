const express = require('express');
const { register, login, getMe, refreshToken, logout } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const auditLog = require('../middleware/auditMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', auditLog('LOGIN', 'User'), login);
router.post('/refresh', refreshToken);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

module.exports = router;
