const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_UPLOADS = path.join(os.tmpdir(), `peerlink-uploads-test-${process.pid}`);
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOADS_PATH = TEMP_UPLOADS;

const storageService = require('../src/services/storageService');
const studyService = require('../src/services/studyService');
const env = require('../src/config/env');

/**
 * Tests for the local storage driver's signed URLs.
 *
 * These carry more weight than most of the suite because the signature IS the
 * authorization for the upload endpoint — the browser sends the file bytes with
 * no Authorization header (it cannot, since the same client code also has to
 * PUT to S3), so a weakness here is a way to write into another student's
 * material or read theirs. Each case below is an attack, not a happy path.
 */
const KEY = 'study-materials/user_alice/1700000000_notes.pdf';
const VICTIM_KEY = 'study-materials/user_bob/1700000000_private.pdf';

function validSignature(key, expires) {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`peerlink-storage-v1:${key}:${expires}`)
    .digest('hex');
}

afterAll(() => {
  fs.rmSync(TEMP_UPLOADS, { recursive: true, force: true });
});

describe('storage driver selection', () => {
  it('uses the local driver when STORAGE_DRIVER=local', () => {
    expect(storageService.driver()).toBe('local');
  });

  it('reports uploads as available on the local driver, with no AWS involved', async () => {
    await expect(storageService.uploadsAvailable()).resolves.toBe(true);
  });
});

describe('signed URL generation', () => {
  it('produces an absolute URL against the supplied API base', async () => {
    const url = await storageService.createUploadUrl({
      key: KEY,
      contentType: 'application/pdf',
      expiresIn: 300,
      baseUrl: 'http://localhost:5000',
    });

    const parsed = new URL(url);
    expect(parsed.origin).toBe('http://localhost:5000');
    expect(parsed.pathname).toBe('/api/study-materials/blob');
    expect(parsed.searchParams.get('key')).toBe(KEY);
    expect(parsed.searchParams.get('signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(Number(parsed.searchParams.get('expires'))).toBeGreaterThan(Date.now());
  });

  it('never puts the signing secret in the URL', async () => {
    const url = await storageService.createUploadUrl({
      key: KEY, contentType: 'application/pdf', expiresIn: 300, baseUrl: 'http://x',
    });
    expect(url).not.toContain(env.jwtSecret);
  });

  it('signs each key differently, so a signature cannot be reused across keys', () => {
    const expires = Date.now() + 60000;
    expect(storageService.sign(KEY, expires)).not.toBe(storageService.sign(VICTIM_KEY, expires));
  });
});

describe('signature verification', () => {
  const future = () => Date.now() + 60000;

  it('accepts a correctly signed, unexpired key', () => {
    const expires = future();
    expect(storageService.verifySignedKey(KEY, expires, validSignature(KEY, expires))).toBe(true);
  });

  it('rejects a missing signature', () => {
    const expires = future();
    expect(() => storageService.verifySignedKey(KEY, expires, undefined)).toThrow(/invalid upload signature/i);
  });

  it('rejects a forged signature', () => {
    const expires = future();
    expect(() => storageService.verifySignedKey(KEY, expires, 'f'.repeat(64)))
      .toThrow(/invalid upload signature/i);
  });

  // The attack that matters most: take your own valid URL and point it at
  // someone else's prefix. The key is inside the signed payload, so it fails.
  it('rejects a valid signature retargeted at another student\u2019s key', () => {
    const expires = future();
    const mySignature = validSignature(KEY, expires);
    expect(() => storageService.verifySignedKey(VICTIM_KEY, expires, mySignature))
      .toThrow(/invalid upload signature/i);
  });

  it('rejects an extended expiry, so a link cannot be made to live longer', () => {
    const expires = future();
    const signature = validSignature(KEY, expires);
    expect(() => storageService.verifySignedKey(KEY, expires + 86400000, signature))
      .toThrow(/invalid upload signature/i);
  });

  it('rejects a correctly signed but EXPIRED link with 410', () => {
    const past = Date.now() - 1000;
    try {
      storageService.verifySignedKey(KEY, past, validSignature(KEY, past));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBe(410);
      expect(err.message).toMatch(/expired/i);
    }
  });

  it('rejects a non-numeric expiry', () => {
    expect(() => storageService.verifySignedKey(KEY, 'soon', 'x')).toThrow(/malformed/i);
  });
});

describe('path traversal', () => {
  it.each([
    ['parent directory', '../../../evil.pdf'],
    ['absolute-ish escape', '../../../../../../etc/passwd'],
  ])('refuses to write outside the upload root (%s)', async (_label, key) => {
    const expires = Date.now() + 60000;
    await expect(
      studyService.putSignedBlob({
        key,
        expires,
        signature: validSignature(key, expires),
        body: Buffer.from('x'),
        contentType: 'application/pdf',
      })
    ).rejects.toThrow(/invalid file reference/i);
  });
});

describe('upload and download round trip', () => {
  const pdf = Buffer.from('%PDF-1.4\ntest content\n%%EOF');

  it('stores and returns the exact bytes', async () => {
    const expires = Date.now() + 60000;
    const written = await studyService.putSignedBlob({
      key: KEY,
      expires,
      signature: validSignature(KEY, expires),
      body: pdf,
      contentType: 'application/pdf',
    });
    expect(written.size).toBe(pdf.length);

    const resolved = await studyService.resolveSignedBlobPath({
      key: KEY, expires, signature: validSignature(KEY, expires),
    });
    expect(fs.readFileSync(resolved)).toEqual(pdf);
  });

  it('rejects an empty body', async () => {
    const expires = Date.now() + 60000;
    await expect(
      studyService.putSignedBlob({
        key: KEY, expires, signature: validSignature(KEY, expires),
        body: Buffer.alloc(0), contentType: 'application/pdf',
      })
    ).rejects.toThrow(/no file content/i);
  });

  it('rejects a content type outside the allowlist', async () => {
    const expires = Date.now() + 60000;
    await expect(
      studyService.putSignedBlob({
        key: KEY, expires, signature: validSignature(KEY, expires),
        body: Buffer.from('MZ'), contentType: 'application/x-msdownload',
      })
    ).rejects.toThrow(/PDF, DOCX and PPTX/i);
  });

  it('404s a download for an object that was never written', async () => {
    const missing = 'study-materials/user_alice/nope.pdf';
    const expires = Date.now() + 60000;
    await expect(
      studyService.resolveSignedBlobPath({
        key: missing, expires, signature: validSignature(missing, expires),
      })
    ).rejects.toThrow(/no longer stored/i);
  });
});
