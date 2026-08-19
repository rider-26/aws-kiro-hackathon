/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const secrets = require('../src/config/secrets');

/**
 * Stores a secret OUTSIDE the repository, in ~/.peerlink/secrets.env.
 *
 * Reads the value from an interactive prompt rather than a command-line
 * argument, deliberately: arguments land in your shell history (and in
 * PowerShell's persistent PSReadLine history file on disk), which is exactly the
 * kind of quiet copy this script exists to avoid.
 *
 * Usage:
 *   npm run secret:set DEEPSEEK_API_KEY
 *   npm run secret:list          # names and fingerprints, never values
 */

const SUPPORTED = ['DEEPSEEK_API_KEY', 'JWT_SECRET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'];

function ensureDir() {
  fs.mkdirSync(secrets.HOME_SECRETS_DIR, { recursive: true });
  // Owner-only on POSIX. A no-op on Windows, where the user profile directory
  // already restricts access to the account that owns it.
  try {
    fs.chmodSync(secrets.HOME_SECRETS_DIR, 0o700);
  } catch { /* not supported on this platform */ }
}

function readExisting() {
  try {
    return fs.readFileSync(secrets.HOME_SECRETS_FILE, 'utf8');
  } catch {
    return '';
  }
}

function upsert(contents, name, value) {
  const lines = contents.split(/\r?\n/);
  const line = `${name}=${value}`;
  let replaced = false;

  const next = lines.map((l) => {
    if (l.trim().startsWith(`${name}=`)) {
      replaced = true;
      return line;
    }
    return l;
  });

  if (!replaced) {
    if (next.length && next[next.length - 1].trim() === '') next.pop();
    next.push(line, '');
  }

  const header = contents.trim()
    ? ''
    : '# PeerLink local secrets. Outside the repository on purpose, so it cannot\n'
      + '# be committed and does not travel when the project folder is copied.\n'
      + '# Read by backend/src/config/secrets.js.\n\n';

  return header + next.join('\n').replace(/\n{3,}/g, '\n\n');
}

function write(contents) {
  ensureDir();
  fs.writeFileSync(secrets.HOME_SECRETS_FILE, contents, { mode: 0o600 });
  try {
    fs.chmodSync(secrets.HOME_SECRETS_FILE, 0o600);
  } catch { /* not supported on this platform */ }
}

function list() {
  console.log(`\n${secrets.HOME_SECRETS_FILE}\n`);
  let found = 0;
  for (const name of SUPPORTED) {
    const { value, source } = secrets.resolve(name);
    if (!value) continue;
    found += 1;
    const where = source === 'environment' ? 'shell environment' : 'home secrets file';
    console.log(`  ${name.padEnd(24)} ${secrets.fingerprint(value)}  [${where}]`);
  }
  if (!found) console.log('  (nothing stored yet)');
  console.log('\nValues are never printed — only length and last 4 characters.\n');
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const [command, name] = process.argv.slice(2);

  if (command === 'list' || (!command && !name)) {
    list();
    return;
  }

  const target = (command === 'set' ? name : command || '').toUpperCase();
  if (!target) {
    console.error(`\nUsage: npm run secret:set <NAME>\n\nKnown names: ${SUPPORTED.join(', ')}\n`);
    process.exit(1);
  }

  if (!SUPPORTED.includes(target)) {
    console.log(`\nNote: "${target}" is not one of the names this app reads.`);
    console.log(`Known names: ${SUPPORTED.join(', ')}`);
    console.log('Storing it anyway.\n');
  }

  const value = await prompt(`Paste the value for ${target} (not echoed to history): `);
  if (!value) {
    console.error('No value entered. Nothing was written.');
    process.exit(1);
  }

  write(upsert(readExisting(), target, value));

  console.log(`\nStored ${target} — ${secrets.fingerprint(value)}`);
  console.log(`Location: ${secrets.HOME_SECRETS_FILE}`);
  console.log('\nThis file is outside the repository, so git cannot see it and it will');
  console.log('not be included if the project folder is zipped or copied.');
  console.log(`\nNow remove ${target} from backend/.env so only one copy exists.\n`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
