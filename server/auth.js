/**
 * auth.js — Multi-tenant authentication
 * Users are stored in Supabase client_users table.
 * JWT encodes: sub (user_id), client_id, role, client_name
 * Roles: super_admin | client_admin | viewer
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { loginLimiter } from './rateLimit.js';
import { requireAuth } from './middleware.js';
import { getSupabase } from './supabase.js';

export const authRouter = express.Router();

// ── Login ─────────────────────────────────────────────────────────────────────
authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, username, password } = req.body || {};
  const identifier = (email || username || '').toLowerCase().trim();

  if (!identifier || !password)
    return res.status(400).json({ error: 'Email and password required' });

  try {
    const sb = getSupabase();

    // Look up user in Supabase client_users
    let user = null, client = null;

    if (sb) {
      const { data: users, error } = await sb
        .from('client_users')
        .select('*, clients(*)')
        .eq('email', identifier)
        .eq('is_active', true)
        .limit(1);

      if (!error && users && users.length > 0) {
        user = users[0];
        client = users[0].clients;
      }
    }

    // Constant-time dummy compare if user not found
    if (!user) {
      await bcrypt.compare('dummy', '$2b$10$dummyhashtopreventtiming00000000000000000000000000');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    // Update last_login
    if (sb) {
      sb.from('client_users').update({ last_login: new Date().toISOString() })
        .eq('id', user.id).then(() => {});
    }

    // Build JWT payload
    const payload = {
      sub:         user.id,
      email:       user.email,
      name:        user.name || user.email.split('@')[0],
      role:        user.role,
      client_id:   user.client_id,
      client_name: client?.name || 'Unknown',
      client_slug: client?.slug || '',
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      ok: true,
      email: user.email,
      name: payload.name,
      role: user.role,
      client_id: user.client_id,
      client_name: payload.client_name,
      redirect: user.role === 'super_admin' ? '/admin' : '/dashboard',
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed, please try again' });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
authRouter.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// ── Verify session ─────────────────────────────────────────────────────────────
authRouter.get('/verify', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    ok: true,
    email:       u.email,
    name:        u.name,
    role:        u.role,
    client_id:   u.client_id,
    client_name: u.client_name,
  });
});
