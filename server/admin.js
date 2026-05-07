/**
 * admin.js — Super-admin API routes
 * All routes require role === 'super_admin'
 *
 * POST   /api/admin/clients              — create new client
 * GET    /api/admin/clients              — list all clients
 * GET    /api/admin/clients/:id          — get one client
 * PATCH  /api/admin/clients/:id          — update client
 * DELETE /api/admin/clients/:id          — delete client
 *
 * POST   /api/admin/clients/:id/users    — add user to client
 * GET    /api/admin/clients/:id/users    — list users of client
 * DELETE /api/admin/users/:uid           — delete user
 * PATCH  /api/admin/users/:uid/password  — reset user password
 *
 * GET    /api/admin/clients/:id/data     — preview client dashboard data
 * POST   /api/admin/clients/:id/upload   — upload data for client
 * GET    /api/admin/stats                — overall platform stats
 */
import express from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from './middleware.js';
import { getSupabase } from './supabase.js';

export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

// ── Helper ────────────────────────────────────────────────────────────────────
function sb() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase not configured');
  return client;
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

// GET /api/admin/clients
adminRouter.get('/clients', async (req, res) => {
  try {
    const { data, error } = await sb()
      .from('clients')
      .select('*, client_users(count), territory_data(count)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/clients — create new client
adminRouter.post('/clients', async (req, res) => {
  const { name, slug, plan = 'basic', industry, country, primary_color } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });

  // slug: lowercase, alphanumeric + hyphens only
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  try {
    const { data, error } = await sb()
      .from('clients')
      .insert({ name, slug: cleanSlug, plan, industry, country, primary_color })
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, client: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/clients/:id
adminRouter.get('/clients/:id', async (req, res) => {
  try {
    const { data, error } = await sb()
      .from('clients')
      .select('*, client_users(*), territory_data(territory, period, net, gross, orders)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/clients/:id
adminRouter.patch('/clients/:id', async (req, res) => {
  const { name, plan, status, industry, country, primary_color, logo_url } = req.body;
  try {
    const { data, error } = await sb()
      .from('clients')
      .update({ name, plan, status, industry, country, primary_color, logo_url,
                 updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, client: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/clients/:id
adminRouter.delete('/clients/:id', async (req, res) => {
  try {
    const { error } = await sb().from('clients').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── USERS ────────────────────────────────────────────────────────────────────

// GET /api/admin/clients/:id/users
adminRouter.get('/clients/:id/users', async (req, res) => {
  try {
    const { data, error } = await sb()
      .from('client_users')
      .select('id, email, name, role, is_active, last_login, created_at')
      .eq('client_id', req.params.id)
      .order('created_at');
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/clients/:id/users — add user
adminRouter.post('/clients/:id/users', async (req, res) => {
  const { email, password, name, role = 'viewer' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await sb()
      .from('client_users')
      .insert({ client_id: req.params.id, email: email.toLowerCase(), password_hash, name, role })
      .select('id, email, name, role, is_active, created_at')
      .single();
    if (error) throw error;
    res.json({ ok: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/users/:uid
adminRouter.delete('/users/:uid', async (req, res) => {
  try {
    const { error } = await sb().from('client_users').delete().eq('id', req.params.uid);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/users/:uid/password
adminRouter.patch('/users/:uid/password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const { error } = await sb()
      .from('client_users')
      .update({ password_hash })
      .eq('id', req.params.uid);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/users/:uid/status
adminRouter.patch('/users/:uid/status', async (req, res) => {
  const { is_active } = req.body;
  try {
    const { error } = await sb()
      .from('client_users')
      .update({ is_active })
      .eq('id', req.params.uid);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DATA ─────────────────────────────────────────────────────────────────────

// GET /api/admin/clients/:id/data — preview client's MIS data
adminRouter.get('/clients/:id/data', async (req, res) => {
  try {
    const { data, error } = await sb()
      .from('territory_data')
      .select('*')
      .eq('client_id', req.params.id)
      .order('territory');
    if (error) throw error;
    res.json({ parsed: Object.fromEntries(
      data.map(r => [`${r.territory}||${r.period}`, r])
    )});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/clients/:id/upsert-data — manually upsert territory row
adminRouter.post('/clients/:id/upsert-data', async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const clientId = req.params.id;
  try {
    const toUpsert = rows.map(r => ({ ...r, client_id: clientId }));
    const { error } = await sb()
      .from('territory_data')
      .upsert(toUpsert, { onConflict: 'territory,period,client_id' });
    if (error) throw error;
    res.json({ ok: true, count: toUpsert.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PLATFORM STATS ───────────────────────────────────────────────────────────

// GET /api/admin/stats
adminRouter.get('/stats', async (req, res) => {
  try {
    const [{ count: clientCount }, { count: userCount }, { count: dataCount }] =
      await Promise.all([
        sb().from('clients').select('id', { count: 'exact', head: true }).then(r => r),
        sb().from('client_users').select('id', { count: 'exact', head: true }).then(r => r),
        sb().from('territory_data').select('id', { count: 'exact', head: true }).then(r => r),
      ]);
    res.json({ clients: clientCount || 0, users: userCount || 0, data_rows: dataCount || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
