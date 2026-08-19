const idGen = require('../utils/idGen');
const userRepository = require('../repositories/userRepository');
const tutorProfileRepository = require('../repositories/tutorProfileRepository');
const tutorVerificationRepository = require('../repositories/tutorVerificationRepository');
const tutorTopicRepository = require('../repositories/tutorTopicRepository');
const tutorAvailabilityRepository = require('../repositories/tutorAvailabilityRepository');
const moduleRepository = require('../repositories/moduleRepository');
const { sanitizeUser } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

const DEFAULT_PROFILE_FIELDS = {
  bio: '',
  teaching_style: '',
  portfolio_url: '',
  linkedin_url: '',
  maximum_group_size: 4,
  maximum_weekly_sessions: 10,
  physical_enabled: true,
  online_enabled: true,
  average_rating: 0,
  completed_sessions: 0,
  students_helped: 0,
  total_tutoring_minutes: 0,
};

/**
 * Ensures a TutorProfile row exists for a given Tutor user, creating a blank
 * default one on first access. Every tutor gets exactly one profile row.
 */
async function ensureProfileForUser(userId) {
  let profile = await tutorProfileRepository.getByUserId(userId);
  if (!profile) {
    profile = await tutorProfileRepository.create({
      id: idGen('tutorprofile'),
      user_id: userId,
      ...DEFAULT_PROFILE_FIELDS,
      created_date: new Date().toISOString(),
    });
  }
  return profile;
}

/**
 * Builds the full public-facing tutor profile: user info (name, course,
 * year, profile image — deliberately excluding any grade data), tutor
 * profile stats, verified module badges only (business rule 1), topics, and
 * availability. This is what both the tutor profile page and tutor cards in
 * search results consume.
 */
async function getFullProfile(tutorProfileId) {
  const profile = await tutorProfileRepository.getById(tutorProfileId);
  if (!profile) throw new ApiError(404, 'Tutor profile not found');

  const [user, verifications, topics, availability] = await Promise.all([
    userRepository.getById(profile.user_id),
    tutorVerificationRepository.listByTutor(profile.id),
    tutorTopicRepository.listByTutor(profile.id),
    tutorAvailabilityRepository.listByTutor(profile.id),
  ]);

  const verifiedVerifications = verifications.filter((v) => v.status === 'Verified');
  const moduleIds = [...new Set(verifiedVerifications.map((v) => v.module_id))];
  const modules = await Promise.all(moduleIds.map((id) => moduleRepository.getById(id)));

  return {
    tutor_profile_id: profile.id,
    user: sanitizeUser(user),
    profile,
    verified_modules: modules.filter(Boolean),
    all_verifications: verifications, // includes Pending/Rejected/Revoked, used on admin/own-profile views
    topics,
    availability: availability.filter((a) => a.active !== false),
  };
}

/**
 * Full profile plus public reviews. Kept separate from getFullProfile so tutor
 * search (which fetches many profiles) doesn't pay for review lookups it never
 * displays.
 *
 * Required lazily to avoid a circular import: reviewService imports
 * sessionService, which does not import tutorService, but reviewService also
 * reads tutorProfileRepository — keeping this require inline documents the
 * one-directional intent and avoids load-order surprises.
 */
async function getFullProfileWithReviews(tutorProfileId) {
  const profile = await getFullProfile(tutorProfileId);
  // eslint-disable-next-line global-require
  const reviewService = require('./reviewService');
  const reviews = await reviewService.listForTutor(tutorProfileId);
  return { ...profile, reviews };
}

async function listAllFullProfiles() {
  const profiles = await tutorProfileRepository.listAll();
  return Promise.all(profiles.map((p) => getFullProfile(p.id)));
}

async function updateOwnProfile(userId, patch) {
  const profile = await ensureProfileForUser(userId);
  const EDITABLE = [
    'bio', 'teaching_style', 'portfolio_url', 'linkedin_url',
    'maximum_group_size', 'maximum_weekly_sessions', 'physical_enabled', 'online_enabled',
  ];
  const safePatch = {};
  for (const key of EDITABLE) {
    if (patch[key] !== undefined) safePatch[key] = patch[key];
  }
  return tutorProfileRepository.update(profile.id, safePatch);
}

async function addTopic(userId, { module_id, topic_name }) {
  if (!module_id || !topic_name) throw new ApiError(400, 'module_id and topic_name are required');
  const profile = await ensureProfileForUser(userId);
  return tutorTopicRepository.create({
    id: idGen('topic'),
    tutor_id: profile.id,
    module_id,
    topic_name,
  });
}

async function removeTopic(userId, topicId) {
  const profile = await ensureProfileForUser(userId);
  const topic = await tutorTopicRepository.getById(topicId);
  if (!topic || topic.tutor_id !== profile.id) {
    throw new ApiError(404, 'Topic not found');
  }
  await tutorTopicRepository.remove(topicId);
}

/**
 * A tutor requests verification for a module (creates a Pending row). This
 * is the ONLY write path a tutor has to TutorVerification — status changes
 * (Verified/Rejected/Revoked) are admin-only (business rule 12: tutors
 * cannot verify themselves), enforced in the admin service/route, not here.
 */
async function requestVerification(userId, moduleId) {
  if (!moduleId) throw new ApiError(400, 'module_id is required');
  const targetModule = await moduleRepository.getById(moduleId);
  if (!targetModule) throw new ApiError(404, 'Module not found');

  const profile = await ensureProfileForUser(userId);
  const existing = await tutorVerificationRepository.listByTutor(profile.id);
  const alreadyRequested = existing.find((v) => v.module_id === moduleId && v.status !== 'Rejected' && v.status !== 'Revoked');
  if (alreadyRequested) {
    throw new ApiError(409, `You already have a ${alreadyRequested.status} verification request for this module`);
  }

  return tutorVerificationRepository.create({
    id: idGen('verification'),
    tutor_id: profile.id,
    module_id: moduleId,
    status: 'Pending',
    verified_by: null,
    verified_date: null,
    admin_notes: '',
    created_date: new Date().toISOString(),
  });
}

module.exports = {
  ensureProfileForUser,
  getFullProfile,
  getFullProfileWithReviews,
  listAllFullProfiles,
  updateOwnProfile,
  addTopic,
  removeTopic,
  requestVerification,
};
