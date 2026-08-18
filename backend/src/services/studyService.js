const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3');
const env = require('../config/env');
const idGen = require('../utils/idGen');
const studyMaterialRepository = require('../repositories/studyMaterialRepository');
const moduleRepository = require('../repositories/moduleRepository');
const {
  SAMPLE_MATERIAL, STUDY_NOTES, FLASHCARDS, AUDIO_NOTES, VIDEO_SCRIPT,
} = require('../content/topic05Content');
const { ApiError } = require('../middleware/errorHandler');

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const PRESIGN_EXPIRY_SECONDS = 300;

/**
 * Study material management (spec section 15).
 *
 * Business rule 9: study material belongs only to the uploading student. Every
 * read here is scoped by student_id, and ownership is re-checked on fetch —
 * there is no endpoint that returns another student's materials.
 *
 * Uploads use S3 presigned PUT URLs so the browser never holds AWS
 * credentials; the object key is derived server-side from the authenticated
 * user id, so a client cannot write into another student's prefix.
 */

async function createUploadUrl(studentId, { filename, content_type, module_id }) {
  if (!filename) throw new ApiError(400, 'filename is required');
  if (content_type && !ALLOWED_CONTENT_TYPES.includes(content_type)) {
    throw new ApiError(400, 'Only PDF, DOCX and PPTX files are supported');
  }

  const safeName = filename.replace(/[^\w.\-]/g, '_').slice(-120);
  const key = `study-materials/${studentId}/${Date.now()}_${safeName}`;

  let uploadUrl;
  try {
    uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: key,
        ContentType: content_type || 'application/pdf',
      }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS }
    );
  } catch (err) {
    throw new ApiError(503, `Could not prepare the upload: ${err.message}`);
  }

  return { upload_url: uploadUrl, file_reference: key, expires_in: PRESIGN_EXPIRY_SECONDS, module_id };
}

/** Records the material row after the browser completes its S3 PUT. */
async function registerMaterial(studentId, { filename, file_reference, module_id, page_count }) {
  if (!filename || !file_reference) {
    throw new ApiError(400, 'filename and file_reference are required');
  }
  // Defensive: never let a client register a key outside their own prefix.
  if (!file_reference.startsWith(`study-materials/${studentId}/`)) {
    throw new ApiError(403, 'Invalid file reference for this account');
  }

  return studyMaterialRepository.create({
    id: idGen('material'),
    student_id: studentId,
    module_id: module_id || null,
    filename,
    file_reference,
    page_count: page_count || null,
    is_sample: false,
    uploaded_date: new Date().toISOString(),
  });
}

/**
 * Ensures the demo Topic05 sample material exists for a student. Called when
 * the student opens the AI Study page so the sample is always available for
 * the demo flow without requiring a real upload.
 */
async function ensureSampleMaterial(studentId) {
  const existing = await studyMaterialRepository.listByStudent(studentId);
  const sample = existing.find((m) => m.is_sample);
  if (sample) return sample;

  const it2513 = await moduleRepository.getByCode(SAMPLE_MATERIAL.module_code);

  return studyMaterialRepository.create({
    id: idGen('material'),
    student_id: studentId,
    module_id: it2513 ? it2513.id : null,
    filename: SAMPLE_MATERIAL.filename,
    file_reference: null, // Demo content: no real S3 object backs this row.
    page_count: SAMPLE_MATERIAL.page_count,
    description: SAMPLE_MATERIAL.description,
    topics: SAMPLE_MATERIAL.topics,
    is_sample: true,
    uploaded_date: new Date().toISOString(),
  });
}

async function listOwnMaterials(studentId) {
  const items = await studyMaterialRepository.listByStudent(studentId);
  return items.sort((a, b) => (b.uploaded_date || '').localeCompare(a.uploaded_date || ''));
}

/** Fetches a material, enforcing ownership (business rule 9). */
async function getOwnMaterial(studentId, materialId) {
  const material = await studyMaterialRepository.getById(materialId);
  if (!material) throw new ApiError(404, 'Study material not found');
  if (material.student_id !== studentId) {
    throw new ApiError(403, 'You do not have access to this study material');
  }
  return material;
}

/** Short-lived download link for the student's own file. */
async function getDownloadUrl(studentId, materialId) {
  const material = await getOwnMaterial(studentId, materialId);
  if (!material.file_reference) {
    throw new ApiError(400, 'This is demo content and has no stored file');
  }
  try {
    return getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: env.s3Bucket, Key: material.file_reference }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS }
    );
  } catch (err) {
    throw new ApiError(503, `Could not prepare the download: ${err.message}`);
  }
}

/**
 * Simulated learning resources (spec sections 15 & 33). These are returned
 * with `simulated: true` and, for non-sample uploads, a note making clear the
 * content is generic rather than derived from the uploaded file
 * (business rule 16).
 */
const RESOURCE_KINDS = ['notes', 'flashcards', 'audio', 'video'];

async function getGeneratedResource(studentId, materialId, kind) {
  if (!RESOURCE_KINDS.includes(kind)) {
    throw new ApiError(400, `kind must be one of ${RESOURCE_KINDS.join(', ')}`);
  }
  const material = await getOwnMaterial(studentId, materialId);

  const byKind = {
    notes: STUDY_NOTES,
    flashcards: FLASHCARDS,
    audio: AUDIO_NOTES,
    video: VIDEO_SCRIPT,
  };

  return {
    kind,
    material_id: material.id,
    material_name: material.filename,
    derived_from_upload: !!material.is_sample,
    content: byKind[kind],
    notice: material.is_sample
      ? 'Demo content prepared for the sample Topic 05 material.'
      : 'Simulated for this prototype — this is general IT2513 revision content, not generated from your uploaded file.',
  };
}

module.exports = {
  createUploadUrl,
  registerMaterial,
  ensureSampleMaterial,
  listOwnMaterials,
  getOwnMaterial,
  getDownloadUrl,
  getGeneratedResource,
  RESOURCE_KINDS,
  ALLOWED_CONTENT_TYPES,
};
