/**
 * Run once to create/update the admin user:
 *   node server/setup-user.js
 *
 * You will be prompted for a username and password.
 * The password hash is stored in server/users.json.
 * The plaintext password is NEVER persisted.
 */
import bcrypt from 'bcryptjs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, 'users.json');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\nFIP MIS — User Setup\n');

  const username = (await ask('Username: ')).trim().toLowerCase();
  if (!username) { console.error('Username required'); process.exit(1); }

  // Hide password input
  process.stdout.write('Password: ');
  process.stdin.setRawMode(true);
  let password = '';
  for await (const chunk of process.stdin) {
    for (const byte of chunk) {
      if (byte === 13 || byte === 10) { process.stdout.write('\n'); break; }
      if (byte === 127) { if (password.length) { password = password.slice(0,-1); process.stdout.write('\b \b'); } continue; }
      password += String.fromCharCode(byte);
      process.stdout.write('*');
    }
    break;
  }
  process.stdin.setRawMode(false);

  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const users = existsSync(USERS_FILE) ? JSON.parse(readFileSync(USERS_FILE, 'utf-8')) : {};
  users[username] = { hash, role: 'admin', createdAt: new Date().toISOString() };
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

  console.log(`\n✓ User "${username}" saved to server/users.json`);
  console.log('  You can now start the server with: npm start\n');
  rl.close();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
