const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Resolves secrets from the safest available source.
 *
 * WHY THIS EXISTS. A gitignored `.env` is the conventional place for local
 * secrets, and it is fine as far as it goes — but it sits INSIDE the repository
 * directory, which leaves two real failure modes that no amount of care fully
 * removes:
 *
 *   1. It can be committed by accident — `git add -f`, a rewritten .gitignore,
 *      or a tool that stages everything. Once a secret is in history it is
 *      effectively public and only rotation fixes it.
 *   2. It travels with the folder. Zipping the project to submit or share, or
 *      copying it to a lab machine, carries the key along silently.
 *
 * So the preferred store is OUTSIDE the repo, in the user's home directory:
 *
 *     ~/.peerlink/secrets.env
 *
 * It cannot be committed because git cannot see it, and it does not move when
 * the project folder does. On POSIX it is created 0600 (owner read/write only).
 *
 * RESOLUTION ORDER, first hit wins:
 *   1. process.env          — CI, container orchestration, AWS Lambda config
 *   2. ~/.peerlink/secrets.env — the preferred local store
 *   3. backend/.env         — legacy/fallback, still supported so nothing breaks
 *
 * Deployment does not use any of this: the CDK stack passes secrets as Lambda
 * environment variables, which land in step 1. See infra/README.md for why
 * Secrets Manager is the right answer for real student data.
 */

const HOME_SECRETS_DIR = path.join(os.homedir(), '.peerlink');
const HOME_SECRETS_FILE = path.join(HOME_SECRETS_DIR, 'secrets.env');

/**
 * Which variables were REALLY in the shell before dotenv ran.
 *
 * dotenv copies backend/.env into process.env, after which the two are
 * indistinguishable — so reporting "from shell environment" for a value that
 * actually came from .env is misleading, and the whole point of the startup
 * banner is to tell you exactly where a secret was loaded from. This snapshot is
 * why config/env.js requires this module BEFORE calling dotenv.config().
 */
const SHELL_KEYS = new Set(Object.keys(process.env));

/** Minimal KEY=VALUE parser. Ignores blanks and #comments, strips quotes. */
function parseEnvFile(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

let homeSecretsCache = null;

function homeSecrets() {
  if (homeSecretsCache) return homeSecretsCache;
  try {
    homeSecretsCache = parseEnvFile(fs.readFileSync(HOME_SECRETS_FILE, 'utf8'));
  } catch {
    homeSecretsCache = {};
  }
  return homeSecretsCache;
}

/**
 * Returns the secret plus WHERE it came from, so startup can report the source
 * without ever printing the value.
 */
function resolve(name) {
  if (process.env[name]) {
    return {
      value: process.env[name],
      // Distinguishes a genuine shell export from a value dotenv lifted out of
      // backend/.env — see SHELL_KEYS above.
      source: SHELL_KEYS.has(name) ? 'shell environment' : 'backend/.env',
    };
  }

  const fromHome = homeSecrets()[name];
  if (fromHome) return { value: fromHome, source: HOME_SECRETS_FILE };

  return { value: undefined, source: null };
}

function get(name) {
  return resolve(name).value;
}

/**
 * A safe fingerprint for logs and diagnostics: enough to confirm which key is
 * loaded, never enough to use it. Deliberately shows only the last 4 characters.
 */
function fingerprint(value) {
  if (!value) return 'not set';
  if (value.length <= 8) return `set (${value.length} chars)`;
  return `set (${value.length} chars, ends ...${value.slice(-4)})`;
}

module.exports = {
  get,
  resolve,
  fingerprint,
  HOME_SECRETS_DIR,
  HOME_SECRETS_FILE,
};
