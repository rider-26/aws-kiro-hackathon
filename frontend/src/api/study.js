import apiClient from './client';

export async function listMaterials() {
  const res = await apiClient.get('/study-materials');
  return res.data.data.materials;
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
