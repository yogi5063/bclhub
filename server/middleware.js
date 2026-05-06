import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  // Try HttpOnly cookie first, then Authorization header (for API clients)
  const token = req.cookies?.token
    || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

  // CRITICAL: API paths must always return 401, never redirect.
  // Otherwise fetch() with default redirect:'follow' chases 302 → /login (200)
  // and login.js mistakes that for "logged in", causing an infinite refresh loop.
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
