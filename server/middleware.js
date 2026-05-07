import jwt from 'jsonwebtoken';

// ── Base auth ─────────────────────────────────────────────────────────────────
export function requireAuth(req, res, next) {
  const token = req.cookies?.token
    || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7) : null);

  const isApi = req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/');

  if (!token) {
    if (isApi) return res.status(401).json({ error: 'Authentication required' });
    return res.redirect('/login');
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('token');
    if (isApi) return res.status(401).json({ error: 'Session expired' });
    return res.redirect('/login');
  }
}

// ── Super admin only ──────────────────────────────────────────────────────────
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ── Any authenticated client user ─────────────────────────────────────────────
export function requireClient(req, res, next) {
  requireAuth(req, res, () => {
    // super_admin can access all clients (for previewing)
    next();
  });
}
