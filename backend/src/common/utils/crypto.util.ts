import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

export async function hashPassword(password: string): Promise<string> {
  try {
    // Dynamic require to prevent application crash if native compiler is missing on Windows
    const argon2 = require('argon2');
    return await argon2.hash(password, { type: argon2.argon2id });
  } catch (err) {
    // Secure fallback: bcrypt with 12 rounds
    return await bcrypt.hash(password, 12);
  }
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith('$argon2')) {
    try {
      const argon2 = require('argon2');
      return await argon2.verify(hash, password);
    } catch (err) {
      throw new Error('Argon2 verification failed: native binding unavailable');
    }
  }
  return await bcrypt.compare(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
