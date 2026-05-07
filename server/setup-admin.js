/**
 * setup-admin.js — Creates the super admin user in Supabase
 * Run once: node server/setup-admin.js
 *
 * Creates:
 *   - Client: "Perk Labs (Super Admin)" with slug "perklabs"
 *   - User: yogi@perklabs.com / admin123 / role: super_admin
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_CLIENT_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_EMAIL     = 'yogi@perklabs.com';
const ADMIN_PASSWORD  = 'Admin@BCL2026!';

async function setup() {
  console.log('Setting up BCL Hub super admin...\n');

  // 1. Ensure admin client exists
  const { data: client, error: ce } = await sb
    .from('clients')
    .upsert({
      id:     ADMIN_CLIENT_ID,
      name:   'Perk Labs (Super Admin)',
      slug:   'perklabs',
      plan:   'enterprise',
      status: 'active',
    }, { onConflict: 'id' })
    .select()
    .single();

  if (ce) { console.error('❌ Client upsert failed:', ce.message); process.exit(1); }
  console.log(`✓ Admin client: ${client.name} (${client.id})`);

  // 2. Hash password
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // 3. Create super admin user
  const { data: user, error: ue } = await sb
    .from('client_users')
    .upsert({
      client_id:     ADMIN_CLIENT_ID,
      email:         ADMIN_EMAIL,
      password_hash,
      name:          'Yogi (Super Admin)',
      role:          'super_admin',
      is_active:     true,
    }, { onConflict: 'email' })
    .select('id, email, role')
    .single();

  if (ue) { console.error('❌ User upsert failed:', ue.message); process.exit(1); }
  console.log(`✓ Super admin user: ${user.email} (${user.role})`);

  console.log(`\n✅ Setup complete!`);
  console.log(`   Login URL : https://bclhub.onrender.com/login`);
  console.log(`   Email     : ${ADMIN_EMAIL}`);
  console.log(`   Password  : ${ADMIN_PASSWORD}`);
  console.log(`   Dashboard : https://bclhub.onrender.com/admin`);
  console.log(`\n⚠️  Change the password after first login!`);
}

setup().catch(e => { console.error('Setup failed:', e); process.exit(1); });
