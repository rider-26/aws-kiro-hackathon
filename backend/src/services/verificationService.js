const tutorVerificationRepository = require('../repositories/tutorVerificationRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const userRepository = require('../repositories/userRepository');
const moduleRepository = require('../repositories/moduleRepository');
const notificationService = require('./notificationService');
const { sanitizeUser } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

const VALID_STATUSES = ['Pending', 'Verified', 'Rejected', 'Revoked'];

/**
 * Tutor-module verification (business rule 12).
 *
 * All TutorVerification status transitions live in `setStatus` and are only
 * reachable via admin-only routes — there is deliberately no tutor-facing
 * write path into this function. A tutor's only write is
 * tutorService.requestVerification, which can create a Pending row and
 * nothing else.
 *
 * A Verified row is what makes a tutor bookable and searchable for a module,
 * so Revoked has real consequences: the tutor immediately stops appearing in
 * that module's search results and can no longer accept bookings for it.
 * That's why revocation notifies the tutor with the admin's reason.
 */

const QUEUE_ORDER = { Pending: 0, Verified: 1, Rejected: 2, Revoked: 3 };

async function setStatus(verificationId, { status, adminId, admin_notes }) {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of ${VALID_STATUSES.join(', ')}`);
  }
  const verification = await tutorVerificationRepository.getById(verificationId);
  if (!verification) throw new ApiError(404, 'Verification request not found');

  if (verification.status === status) {
    throw new ApiError(409, `This request is already ${status}`);
  }

  // Revoking only makes sense for something currently Verified — revoking a
  // rejected or pending request would record a state that never existed.
  if (status === 'Revoked' && verification.status !== 'Verified') {
    throw new ApiError(409, 'Only a Verified module can be revoked');
  }

  const patch = {
    status,
    admin_notes: admin_notes !== undefined ? admin_notes : verification.admin_notes || '',
  };
  if (status !== 'Pending') {
    patch.verified_by = adminId;
    patch.verified_date = new Date().toISOString();
  }

  const updated = await tutorVerificationRepository.update(verificationId, patch);

  // Best-effort: a notification failure must not undo a persisted decision.
  try {
    await notifyTutorOfDecision(updated);
  } catch (err) {
    console.warn('[verification] notification failed after decision:', err.message);
  }

  return updated;
}

const DECISION_MESSAGES = {
  Verified: (code) => ({
    title: `You're verified for ${code}`,
    message: `An administrator approved your verification for ${code}. Students can now find and book you for this module.`,
  }),
  Rejected: (code) => ({
    title: `Verification not approved for ${code}`,
    message: `An administrator did not approve your verification request for ${code}. Check the notes on your profile and you can request again.`,
  }),
  Revoked: (code) => ({
    title: `Verification revoked for ${code}`,
    message: `An administrator revoked your verification for ${code}. You will no longer appear in search results or accept bookings for this module.`,
  }),
};

async function notifyTutorOfDecision(verification) {
  const builder = DECISION_MESSAGES[verification.status];
  if (!builder) return;

  const profile = await tutorProfileRepository.getById(verification.tutor_id);
  if (!profile) return;

  const targetModule = await moduleRepository.getById(verification.module_id);
  const code = targetModule?.module_code || 'this module';

  const { title, message } = builder(code);
  await notificationService.notify(profile.user_id, {
    type: 'TutorVerified',
    title,
    message,
    link: '/tutor/profile',
  });
}

/**
 * Hydrates a verification with the tutor and module the admin needs to make a
 * decision, so the queue doesn't just show two opaque ids.
 */
async function hydrate(verification) {
  const profile = await tutorProfileRepository.getById(verification.tutor_id);
  const [user, targetModule] = await Promise.all([
    profile ? userRepository.getById(profile.user_id) : null,
    moduleRepository.getById(verification.module_id),
  ]);

  return {
    ...verification,
    tutor: profile
      ? {
          tutor_profile_id: profile.id,
          user: sanitizeUser(user),
          average_rating: profile.average_rating || 0,
          completed_sessions: profile.completed_sessions || 0,
          bio: profile.bio || '',
          teaching_style: profile.teaching_style || '',
          portfolio_url: profile.portfolio_url || '',
          linkedin_url: profile.linkedin_url || '',
        }
      : null,
    module: targetModule
      ? { id: targetModule.id, module_code: targetModule.module_code, module_name: targetModule.module_name }
      : null,
  };
}

/**
 * The admin verification queue. Pending first so requests awaiting a decision
 * are always at the top, then newest-first within each status.
 */
async function listForAdmin({ status } = {}) {
  const all = await tutorVerificationRepository.listAll();
  const filtered = status ? all.filter((v) => v.status === status) : all;

  const sorted = filtered.sort((a, b) => {
    const rank = (QUEUE_ORDER[a.status] ?? 9) - (QUEUE_ORDER[b.status] ?? 9);
    if (rank !== 0) return rank;
    return (b.created_date || '').localeCompare(a.created_date || '');
  });

  const verifications = await Promise.all(sorted.map(hydrate));

  return {
    verifications,
    counts: {
      total: all.length,
      pending: all.filter((v) => v.status === 'Pending').length,
      verified: all.filter((v) => v.status === 'Verified').length,
      rejected: all.filter((v) => v.status === 'Rejected').length,
      revoked: all.filter((v) => v.status === 'Revoked').length,
    },
  };
}

async function listPending() {
  const all = await tutorVerificationRepository.listAll();
  return all.filter((v) => v.status === 'Pending');
}

async function listAll() {
  return tutorVerificationRepository.listAll();
}

module.exports = { setStatus, listPending, listAll, listForAdmin, hydrate, VALID_STATUSES };
