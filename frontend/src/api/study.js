import apiClient from './client';

/**
 * Returns { materials, uploads_enabled, uploads_disabled_reason }.
 *
 * `uploads_enabled` reports whether the backend can actually issue a presigned
 * S3 URL, so the page can present the dropzone honestly rather than accepting a
 * file and failing afterwards.
 */
export async function listMaterials() {
  const res = await apiClient.get('/study-materials');
  return res.data.data;
}

export async function getMaterial(id) {
  const res = await apiClient.get(`/study-materials/${id}`);
  return res.data.data.material;
}

export async function requestUploadUrl({ filename, content_type, module_id }) {
  const res = await apiClient.post('/study-materials/upload-url', { filename, content_type, module_id });
  return res.data.data;
}

export async function registerMaterial(payload) {
  const res = await apiClient.post('/study-materials', payload);
  return res.data.data.material;
}

export async function getResource(materialId, kind) {
  const res = await apiClient.get(`/study-materials/${materialId}/resources/${kind}`);
  return res.data.data;
}

/**
 * Uploads straight to S3 with the presigned URL, then registers the material.
 * The file never passes through our API, and the browser never sees AWS
 * credentials.
 */
export async function uploadStudyMaterial(file, { module_id } = {}) {
  const { upload_url, file_reference } = await requestUploadUrl({
    filename: file.name,
    content_type: file.type || 'application/pdf',
    module_id,
  });

  const putRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/pdf' },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Upload failed with status ${putRes.status}`);
  }

  return registerMaterial({ filename: file.name, file_reference, module_id });
}
