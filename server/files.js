import express from 'express';
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { requireAuth } from './middleware.js';

export const filesRouter = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'D:/Perklabs-mis/Upload';

function scanDir(dir, relBase, acc) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = path.join(dir, name);
    const rel  = relBase ? `${relBase}/${name}` : name;
    try {
      if (statSync(full).isDirectory()) {
        scanDir(full, rel, acc);
      } else {
        const lower = name.toLowerCase();
        if (lower.endsWith('.xlsx') || lower.endsWith('.csv')) {
          acc.push(rel);
        }
      }
    } catch { /* skip unreadable entries */ }
  }
}

// GET /api/files — returns list of all .xlsx and .csv relative paths in UPLOAD_DIR
filesRouter.get('/files', requireAuth, (req, res) => {
  const files = [];
  scanDir(UPLOAD_DIR, '', files);
  res.json({ files, uploadDir: UPLOAD_DIR });
});
