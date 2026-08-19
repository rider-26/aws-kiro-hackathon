const idGen = require('../utils/idGen');
const savedTutorRepository = require('../repositories/savedTutorRepository');
const tutorService = require('./tutorService');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Saved tutors (a tutee shortlist). Every read and write is scoped to the
 * authenticated student — there is no way to see or modify another student's
 * saved list.
 */

async function save(studentId, tutorProfileId) {
  const profile = await tutorProfileRepository.getById(tutorProfileId);
  if (!profile) throw new ApiError(404, 'Tutor not found');

  const existing = await savedTutorRepository.listByStudent(studentId);
  const already = existing.find((s) => s.tutor_id === tutorProfileId);
  // Idempotent: saving twice is a no-op rather than an error, since the UI
  // toggles optimistically.
  if (already) return already;

  return savedTutorRepository.create({
    id: idGen('saved'),
    student_id: studentId,
    tutor_id: tutorProfileId,
    created_date: new Date().toISOString(),
  });
}

async function unsave(studentId, tutorProfileId) {
  const existing = await savedTutorRepository.listByStudent(studentId);
  const row = existing.find((s) => s.tutor_id === tutorProfileId);
  if (!row) return { removed: false };

  await savedTutorRepository.remove(row.id);
  return { removed: true };
}

/** Just the ids, for cheaply marking cards as saved in search results. */
async function listSavedTutorIds(studentId) {
  const rows = await savedTutorRepository.listByStudent(studentId);
  return rows.map((r) => r.tutor_id);
}

/** Full tutor profiles for the saved-tutors view. */
async function listSavedTutors(studentId) {
  const rows = await savedTutorRepository.listByStudent(studentId);

  const profiles = await Promise.all(
    rows.map(async (row) => {
      try {
        const full = await tutorService.getFullProfile(row.tutor_id);
        return { ...full, saved_date: row.created_date };
      } catch {
        // A tutor profile could have been removed; skip rather than fail the list.
        return null;
      }
    })
  );

  return profiles
    .filter(Boolean)
    .sort((a, b) => (b.saved_date || '').localeCompare(a.saved_date || ''));
}

module.exports = { save, unsave, listSavedTutors, listSavedTutorIds };
