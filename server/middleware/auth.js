/**
 * Authentication middleware - PREPARED but NOT enforced.
 *
 * This module contains JWT-based authentication logic that is fully written
 * but only activated when the AUTH_ENABLED environment variable is set to 'true'.
 *
 * How to enable authentication:
 *   1. Set AUTH_ENABLED=true in your .env file
 *   2. Set JWT_SECRET to a strong, random secret (at least 32 chars)
 *   3. Create user accounts via the users table (password hashing not included here -
 *      use bcrypt in a registration route when ready)
 *   4. Issue JWTs on login (create a POST /api/v1/auth/login route)
 *   5. Apply authenticate middleware to protected routes:
 *        router.get('/protected', authenticate, handler)
 *   6. Apply requireRole for admin-only routes:
 *        router.delete('/admin-only', authenticate, requireRole('admin'), handler)
 *
 * Token format expected in request:
 *   Authorization: Bearer <jwt-token>
 */

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';

/**
 * Minimal JWT helpers using Node.js built-in crypto.
 * For production, replace with the `jsonwebtoken` package.
 */
function base64UrlEncode(data) {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf-8');
}

function createToken(payload, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) return null;

  // Decode and check expiry
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract bearer token from Authorization header.
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * authenticate - Blocks unauthenticated requests (when auth is enabled).
 *
 * When AUTH_ENABLED is false, this middleware simply calls next()
 * so all routes remain accessible without a token.
 */
function authenticate(req, res, next) {
  // If auth is not enabled, pass through
  if (!AUTH_ENABLED) {
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide a Bearer token in the Authorization header.',
    });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.',
    });
  }

  // Attach user info to request
  req.user = payload;
  next();
}

/**
 * optionalAuth - Attaches user info if a valid token is present, but never blocks.
 *
 * Useful for routes that behave differently for logged-in vs anonymous users.
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

/**
 * requireRole - Factory that returns middleware checking the user's role.
 *
 * Must be used AFTER authenticate middleware.
 * Example: router.delete('/admin', authenticate, requireRole('admin'), handler)
 *
 * When AUTH_ENABLED is false, this middleware simply calls next().
 */
function requireRole(role) {
  return (req, res, next) => {
    // If auth is not enabled, pass through
    if (!AUTH_ENABLED) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${role}.`,
      });
    }

    next();
  };
}

module.exports = { authenticate, optionalAuth, requireRole, createToken, verifyToken };
