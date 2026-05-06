import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { loginLimiter } from './rateLimit.js';
import { requireAuth } from './middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  try {
    return JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('loadUsers error:', err);
    return {};
  }
}

export const authRouter = express.Router();

// POST /api/login
authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const users = loadUsers();
  const user = users[username.toLowerCase()];

  if (!user) {
    // Constant-time response to prevent user enumeration
    await bcrypt.compare('dummy', '$2b$10$dummyhashtopreventtiming00000000000000000000');
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const ok = await bcrypt.compare(password, user.hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign(
    { sub: username.toLowerCase(), role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({ ok: true, username: username.toLowerCase() });
});

// POST /api/logout
authRouter.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /api/verify — check if session is valid
authRouter.get('/verify', requireAuth, (req, res) => {
  res.json({ ok: true, username: req.user.sub, role: req.user.role || 'user' });
});
