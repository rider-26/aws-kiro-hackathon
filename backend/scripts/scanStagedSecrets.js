#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('child_process');

/**
 * Refuses a commit that would introduce a credential.
 *
 * This is the backstop for the one failure mode that cannot be undone: once a
 * secret reaches git history, removing it means rewriting history AND rotating
 * the key anyway. Everything else about secret handling is recoverable; this is
 * not. Wired as a git pre-commit hook (see `npm run hooks:install`).
 *
 * Deliberately scans the STAGED DIFF rather than whole files, so it only
 * complains about what you are actually about to commit.
 *
 * Exits 1 to block, 0 to allow.
 */

const PATTERNS = [
  { name: 'DeepSeek / OpenAI-style API key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'AWS secret access key assignment', re: /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}/i },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'Slack token', re: /\bxox[abpsr]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Hardcoded JWT secret', re: /jwt_?secret\s*[=:]\s*['"][^'"\s]{12,}['"]/i },
];

// Files that legitimately contain secret-shaped example text.
const ALLOWLIST = [
  /\.env\.example$/,
  /scripts[/\\]scanStagedSecrets\.js$/,
];

function staged(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

const files = staged('diff --cached --name-only --diff-filter=ACM')
  .split(/\r?\n/)
  .map((f) => f.trim())
  .filter(Boolean);

if (files.length === 0) process.exit(0);

const findings = [];

for (const file of files) {
  if (ALLOWLIST.some((re) => re.test(file))) continue;

  // A .env file should never be committed regardless of its contents.
  if (/(^|[/\\])\.env(\.|$)/.test(file) && !/\.example$/.test(file)) {
    findings.push({ file, line: 0, name: 'environment file staged for commit', snippet: file });
    continue;
  }

  const diff = staged(`diff --cached -U0 -- "${file}"`);
  let lineNo = 0;

  for (const line of diff.split(/\r?\n/)) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;

    const added = line.slice(1);
    for (const { name, re } of PATTERNS) {
      const match = added.match(re);
      if (match) {
        // Report only a masked fragment — never echo the credential.
        const masked = `${match[0].slice(0, 6)}...${match[0].slice(-4)}`;
        findings.push({ file, line: lineNo, name, snippet: masked });
      }
    }
    lineNo += 1;
  }
}

if (findings.length === 0) process.exit(0);

console.error('\nCOMMIT BLOCKED — this change appears to contain a credential.\n');
for (const f of findings) {
  console.error(`  ${f.file}${f.line ? `:${f.line}` : ''}`);
  console.error(`    ${f.name}  (${f.snippet})\n`);
}
console.error('A secret in git history cannot be taken back — removing it means rewriting');
console.error('history and rotating the key anyway. So fix it before committing:\n');
console.error('  1. Remove the value from the file.');
console.error('  2. Store it outside the repo:  cd backend && npm run secret:set <NAME>');
console.error('  3. Re-stage and commit again.\n');
console.error('If this is genuinely a false positive, commit with --no-verify.\n');
process.exit(1);
