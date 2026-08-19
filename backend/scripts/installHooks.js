/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Installs the git pre-commit hook that blocks committing credentials.
 *
 * Git hooks are not version-controlled, so this has to be run once per clone —
 * `npm run hooks:install`. It is idempotent and refuses to clobber an unrelated
 * existing hook.
 *
 * Usage: npm run hooks:install
 */

function gitDir() {
  try {
    const out = execSync('git rev-parse --git-dir', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return path.resolve(process.cwd(), out.trim());
  } catch {
    return null;
  }
}

const MARKER = '# peerlink-secret-scan';

// Uses sh so it works with Git Bash on Windows, macOS and Linux alike. The
// scanner path is resolved relative to the hook file's repo root.
const HOOK = `#!/bin/sh
${MARKER}
# Blocks commits that would introduce a credential. Installed by
# backend/scripts/installHooks.js — see backend/scripts/scanStagedSecrets.js.
node "$(git rev-parse --show-toplevel)/backend/scripts/scanStagedSecrets.js" || exit 1
`;

const dir = gitDir();
if (!dir) {
  console.error('Not a git repository — nothing to install.');
  process.exit(1);
}

const hooksDir = path.join(dir, 'hooks');
const hookPath = path.join(hooksDir, 'pre-commit');

fs.mkdirSync(hooksDir, { recursive: true });

if (fs.existsSync(hookPath)) {
  const existing = fs.readFileSync(hookPath, 'utf8');
  if (existing.includes(MARKER)) {
    console.log('pre-commit hook already installed — refreshing it.');
  } else {
    const backup = `${hookPath}.backup`;
    fs.copyFileSync(hookPath, backup);
    console.log(`An unrelated pre-commit hook was already present. Backed it up to:\n  ${backup}`);
    console.log('Re-add its contents manually if you still need it.');
  }
}

fs.writeFileSync(hookPath, HOOK, { mode: 0o755 });
try {
  fs.chmodSync(hookPath, 0o755);
} catch { /* not supported on this platform */ }

console.log(`\nInstalled pre-commit secret scanner:\n  ${hookPath}`);
console.log('\nAny commit that adds an API key, AWS credential or private key will now be');
console.log('blocked before it can reach git history. Bypass with --no-verify if you must.\n');
