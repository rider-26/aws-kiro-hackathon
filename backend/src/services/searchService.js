const tutorService = require('./tutorService');
const { computeMatch } = require('./matchService');

/**
 * Search & filter tutors (spec section 9) with match scoring (section 10)
 * layered on top. Business rule 1 is enforced here: if a moduleId filter is
 * supplied, only tutors VERIFIED for that module are returned at all —
 * unverified tutors never appear in module-filtered results, full stop.
 *
 * @param {object} filters
 * @param {string} [filters.moduleId]
 * @param {string} [filters.topic] - single topic name filter (hard filter, must teach it)
 * @param {string} [filters.day] - availability day filter
 * @param {string} [filters.sessionType] - 'Individual' | 'Group' (maps to groupSize semantics for hard filtering)
 * @param {string} [filters.mode] - 'Physical' | 'Online' | 'Both'
 * @param {number} [filters.minRating]
 * @param {number} [filters.groupSize]
 * @param {string[]} [filters.weakTopics] - for match scoring only, not a hard filter
 * @param {string[]} [filters.preferredTopics] - explicit topics of interest, used for match scoring (defaults to [topic] if provided)
 */
async function searchTutors(filters = {}) {
  const {
    moduleId, topic, day, sessionType, mode, minRating, groupSize, weakTopics, preferredTopics,
  } = filters;

  let tutors = await tutorService.listAllFullProfiles();

  // --- Hard filters (exclude non-matching tutors entirely) ---
  if (moduleId) {
    tutors = tutors.filter((t) => t.verified_modules.some((m) => m.id === moduleId));
  }

  if (topic) {
    const topicLower = topic.toLowerCase();
    tutors = tutors.filter((t) =>
      t.topics.some((tt) => tt.topic_name.toLowerCase() === topicLower && (!moduleId || tt.module_id === moduleId))
    );
  }

  if (day) {
    const dayLower = day.toLowerCase();
    tutors = tutors.filter((t) => t.availability.some((a) => a.day_or_date.toLowerCase() === dayLower));
  }

  if (mode) {
    tutors = tutors.filter((t) => {
      if (mode === 'Physical') return !!t.profile.physical_enabled;
      if (mode === 'Online') return !!t.profile.online_enabled;
      return t.profile.physical_enabled || t.profile.online_enabled; // 'Both' = supports at least one
    });
  }

  if (minRating) {
    tutors = tutors.filter((t) => (t.profile.average_rating || 0) >= Number(minRating));
  }

  if (groupSize) {
    tutors = tutors.filter((t) => (t.profile.maximum_group_size || 1) >= Number(groupSize));
  }

  if (sessionType === 'Group') {
    tutors = tutors.filter((t) => (t.profile.maximum_group_size || 1) > 1);
  }

  // --- Match scoring (soft ranking, section 10) ---
  const scored = tutors.map((t) => {
    const match = computeMatch(t, {
      moduleId,
      topics: preferredTopics || (topic ? [topic] : undefined),
      weakTopics,
      preferredDay: day,
      preferredMode: mode,
      groupSize,
    });
    return { ...t, match };
  });

  scored.sort((a, b) => b.match.score - a.match.score);

  return scored;
}

module.exports = { searchTutors };
