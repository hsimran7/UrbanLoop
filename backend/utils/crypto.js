const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Hash a password using bcrypt (same as NestJS original)
 */
async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
}

/**
 * Verify a password against its hash
 */
async function verifyPassword(plain, hash) {
  if (!hash) return false;
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    return bcrypt.compare(plain, hash);
  }
  return plain === hash;
}

/**
 * Generate a cryptographically random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using SHA-256 (for safe DB storage)
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { hashPassword, verifyPassword, generateToken, hashToken };
