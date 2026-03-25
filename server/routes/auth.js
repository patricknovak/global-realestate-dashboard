/**
 * Auth API routes
 *
 * POST /api/v1/auth/register  - Create a new user account
 * POST /api/v1/auth/login     - Log in and receive a JWT token
 * GET  /api/v1/auth/me        - Get current user info (requires auth)
 * PUT  /api/v1/auth/me        - Update user profile (requires auth)
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authenticate, createToken } = require('../middleware/auth');

// Password hashing using Node.js built-in crypto (PBKDF2)
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const result = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(result, 'hex'), Buffer.from(hash, 'hex'));
}

module.exports = function (db) {
  // POST /auth/register
  router.post('/register', (req, res) => {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'email and password are required.' });
      }
      if (typeof email !== 'string' || !email.includes('@') || email.length > 255) {
        return res.status(400).json({ success: false, error: 'Invalid email address.' });
      }
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
      }
      if (password.length > 128) {
        return res.status(400).json({ success: false, error: 'Password must be at most 128 characters.' });
      }

      // Check if email already exists
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (existing) {
        return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
      }

      const { hash, salt } = hashPassword(password);
      const passwordHash = `${salt}:${hash}`;

      const result = db.prepare(`
        INSERT INTO users (email, password_hash, name, role)
        VALUES (@email, @password_hash, @name, 'buyer')
      `).run({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        name: (name || '').trim().substring(0, 200) || null,
      });

      const userId = Number(result.lastInsertRowid);
      const token = createToken({ id: userId, email: email.toLowerCase().trim(), role: 'buyer' });

      res.status(201).json({
        success: true,
        data: {
          id: userId,
          email: email.toLowerCase().trim(),
          name: (name || '').trim() || null,
          role: 'buyer',
          token,
        },
        message: 'Account created successfully.',
      });
    } catch (err) {
      console.error('[AUTH] Register error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to create account.' });
    }
  });

  // POST /auth/login
  router.post('/login', (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'email and password are required.' });
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (!user || !user.password_hash) {
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
      }

      const [salt, hash] = user.password_hash.split(':');
      if (!salt || !hash || !verifyPassword(password, hash, salt)) {
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
      }

      // Update last_login
      db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

      const token = createToken({ id: user.id, email: user.email, role: user.role });

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          token,
        },
        message: 'Login successful.',
      });
    } catch (err) {
      console.error('[AUTH] Login error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to log in.' });
    }
  });

  // GET /auth/me
  router.get('/me', authenticate, (req, res) => {
    try {
      const user = db.prepare('SELECT id, email, name, role, preferences, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }

      res.json({
        success: true,
        data: {
          ...user,
          preferences: user.preferences ? JSON.parse(user.preferences) : null,
        },
      });
    } catch (err) {
      console.error('[AUTH] Me error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve user info.' });
    }
  });

  // PUT /auth/me
  router.put('/me', authenticate, (req, res) => {
    try {
      const { name, preferences } = req.body;

      const setClauses = [];
      const params = { id: req.user.id };

      if (name !== undefined) {
        setClauses.push('name = @name');
        params.name = String(name).trim().substring(0, 200);
      }
      if (preferences !== undefined) {
        setClauses.push('preferences = @preferences');
        params.preferences = JSON.stringify(preferences);
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid fields to update.' });
      }

      db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = @id`).run(params);

      const user = db.prepare('SELECT id, email, name, role, preferences, created_at, last_login FROM users WHERE id = ?').get(req.user.id);

      res.json({
        success: true,
        data: {
          ...user,
          preferences: user.preferences ? JSON.parse(user.preferences) : null,
        },
        message: 'Profile updated successfully.',
      });
    } catch (err) {
      console.error('[AUTH] Update error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to update profile.' });
    }
  });

  return router;
};
