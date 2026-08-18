const tutorService = require('../services/tutorService');
const availabilityService = require('../services/availabilityService');
const searchService = require('../services/searchService');
const { ok, created } = require('../utils/response');

async function listTutors(req, res, next) {
  try {
    const profiles = await tutorService.listAllFullProfiles();
    return ok(res, { tutors: profiles });
  } catch (err) {
    return next(err);
  }
}

function parseListParam(value) {
  if (!value) return undefined;
  return Array.isArray(value) ? value : String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

async function searchTutors(req, res, next) {
  try {
    const q = req.query;
    const results = await searchService.searchTutors({
      moduleId: q.moduleId || undefined,
      topic: q.topic || undefined,
      day: q.day || undefined,
      sessionType: q.sessionType || undefined,
      mode: q.mode || undefined,
      minRating: q.minRating ? Number(q.minRating) : undefined,
      groupSize: q.groupSize ? Number(q.groupSize) : undefined,
      weakTopics: parseListParam(q.weakTopics),
      preferredTopics: parseListParam(q.preferredTopics),
    });
    return ok(res, { tutors: results });
  } catch (err) {
    return next(err);
  }
}

async function getTutorById(req, res, next) {
  try {
    const profile = await tutorService.getFullProfileWithReviews(req.params.id);
    return ok(res, { tutor: profile });
  } catch (err) {
    return next(err);
  }
}

async function getOwnTutorProfile(req, res, next) {
  try {
    const profile = await tutorService.ensureProfileForUser(req.user.id);
    const full = await tutorService.getFullProfile(profile.id);
    return ok(res, { tutor: full });
  } catch (err) {
    return next(err);
  }
}

async function updateOwnTutorProfile(req, res, next) {
  try {
    const updated = await tutorService.updateOwnProfile(req.user.id, req.body);
    return ok(res, { profile: updated });
  } catch (err) {
    return next(err);
  }
}

async function addTopic(req, res, next) {
  try {
    const topic = await tutorService.addTopic(req.user.id, req.body);
    return created(res, { topic });
  } catch (err) {
    return next(err);
  }
}

async function removeTopic(req, res, next) {
  try {
    await tutorService.removeTopic(req.user.id, req.params.topicId);
    return ok(res, { removed: true });
  } catch (err) {
    return next(err);
  }
}

async function requestVerification(req, res, next) {
  try {
    const verification = await tutorService.requestVerification(req.user.id, req.body.module_id);
    return created(res, { verification });
  } catch (err) {
    return next(err);
  }
}

async function listOwnAvailability(req, res, next) {
  try {
    const slots = await availabilityService.listOwn(req.user.id);
    return ok(res, { availability: slots });
  } catch (err) {
    return next(err);
  }
}

async function addAvailability(req, res, next) {
  try {
    const slot = await availabilityService.addSlot(req.user.id, req.body);
    return created(res, { availability: slot });
  } catch (err) {
    return next(err);
  }
}

async function updateAvailability(req, res, next) {
  try {
    const slot = await availabilityService.updateSlot(req.user.id, req.params.slotId, req.body);
    return ok(res, { availability: slot });
  } catch (err) {
    return next(err);
  }
}

async function removeAvailability(req, res, next) {
  try {
    await availabilityService.removeSlot(req.user.id, req.params.slotId);
    return ok(res, { removed: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listTutors,
  searchTutors,
  getTutorById,
  getOwnTutorProfile,
  updateOwnTutorProfile,
  addTopic,
  removeTopic,
  requestVerification,
  listOwnAvailability,
  addAvailability,
  updateAvailability,
  removeAvailability,
};
