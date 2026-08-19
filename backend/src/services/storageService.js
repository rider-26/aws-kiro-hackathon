const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

/**
 * File storage, with two interchangeable drivers (STORAGE_DRIVER).
 *
 *   s3    — presigned PUT/GET straight to S3. What the deployed app uses.
 *   local — files on disk under backend/data/uploads. What local dev uses, so
 *           uploading works with no AWS account at all.
 *
 * The local driver deliberately mimics S3's PRESIGNED URL model rather than
 * accepting an authenticated multipart POST. That keeps the client contract
 * identical across both drivers — request a URL, PUT the bytes to it, register
 * the material — so the frontend has one code path and nothing above this file
 * needs to know which driver is active.
 *
 * SECURITY MODEL for local URLs. The browser PUTs the file with a bare fetch
 * and no Authorization header (it cannot send one to S3, so the shared contract
 * cannot rely on it). Authority therefore comes from the URL itself: the object
 * key and an expiry are signed with HMAC-SHA256 under the server's JWT secret.
 * Because the key is derived server-side and embeds the owning student id, a
 * valid signature proves this server issued this exact key, for that student,
 * within the expiry window. An attacker cannot forge one without the secret,
 * and cannot retarget a captured URL at another student's prefix because the
 * key is part of the signed payload.
 */

const SIGNING_CONTEXT = 'peerlink-storage-v1';

function driver() {
  return env.storageDriver;
}

// --- Local disk paths --------------------------------------------------------

function uploadRoot() {
  return env.uploadsPath;
}

/**
 * Resolves an object key to a path, refusing anything that escapes the upload
 * root. Keys are server-generated, but path traversal is cheap to rule out and
 * expensive to discover later.
 */
function resolveLocalPath(key) {
  const root = path.resolve(uploadRoot());
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new ApiError(400, 'Invalid file reference');
  }
  return target;
}

// --- URL signing (local driver) ---------------------------------------------

function sign(key, expires) {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`${SIGNING_CONTEXT}:${key}:${expires}`)
    .digest('hex');
}

/** Timing-safe comparison so the check can't be probed byte by byte. */
function signatureMatches(expected, provided) {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(provided || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verifies a signed local URL. Throws rather than returning false so every
 * caller fails closed.
 */
function verifySignedKey(key, expires, signature) {
  const expiresAt = Number(expires);
  if (!key || !Number.isFinite(expiresAt)) {
    throw new ApiError(400, 'Malformed upload URL');
  }
  if (!signatureMatches(sign(key, expiresAt), signature)) {
    throw new ApiError(403, 'Invalid upload signature');
  }
  if (Date.now() > expiresAt) {
    throw new ApiError(410, 'This upload link has expired. Please choose the file again.');
  }
  return true;
}

function buildSignedUrl(baseUrl, key, expiresInSeconds) {
  const expires = Date.now() + expiresInSeconds * 1000;
  const params = new URLSearchParams({
    key,
    expires: String(expires),
    signature: sign(key, expires),
  });
  return `${baseUrl.replace(/\/$/, '')}/api/study-materials/blob?${params.toString()}`;
}

// --- Public API -------------------------------------------------------------

/**
 * Whether uploads can actually be performed right now.
 *
 * Local is always available. For S3 we resolve credentials through the SDK's own
 * provider chain rather than reading environment variables, so the answer is
 * correct both locally and on Lambda, where credentials come from the execution
 * role and no keys are ever set.
 */
let s3AvailableCache = null;

async function uploadsAvailable() {
  if (driver() === 'local') return true;
  if (s3AvailableCache !== null) return s3AvailableCache;

  if (!env.s3Bucket) {
    s3AvailableCache = false;
    return false;
  }

  try {
    // eslint-disable-next-line global-require
    const s3 = require('../config/s3');
    const resolve = s3.config.credentials;
    const credentials = typeof resolve === 'function' ? await resolve() : resolve;
    s3AvailableCache = !!credentials?.accessKeyId;
  } catch {
    s3AvailableCache = false;
  }

  return s3AvailableCache;
}

async function createUploadUrl({ key, contentType, expiresIn, baseUrl }) {
  if (driver() === 'local') {
    await fsp.mkdir(path.dirname(resolveLocalPath(key)), { recursive: true });
    return buildSignedUrl(baseUrl, key, expiresIn);
  }

  // eslint-disable-next-line global-require
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  // eslint-disable-next-line global-require
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  // eslint-disable-next-line global-require
  const s3 = require('../config/s3');

  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

async function createDownloadUrl({ key, expiresIn, baseUrl }) {
  if (driver() === 'local') {
    return buildSignedUrl(baseUrl, key, expiresIn);
  }

  // eslint-disable-next-line global-require
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  // eslint-disable-next-line global-require
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  // eslint-disable-next-line global-require
  const s3 = require('../config/s3');

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }), { expiresIn });
}

/** Writes bytes for a verified local upload. */
async function putLocalObject(key, buffer) {
  const target = resolveLocalPath(key);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, buffer);
  return { key, size: buffer.length };
}

async function localObjectExists(key) {
  try {
    await fsp.access(resolveLocalPath(key), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function localObjectPath(key) {
  return resolveLocalPath(key);
}

module.exports = {
  driver,
  uploadsAvailable,
  createUploadUrl,
  createDownloadUrl,
  putLocalObject,
  localObjectExists,
  localObjectPath,
  verifySignedKey,
  // Exported for tests.
  sign,
};
