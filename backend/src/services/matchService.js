/**
 * Rule-based, transparent tutor match scoring (spec section 10). This is
 * deliberately NOT machine learning — every component is a simple,
 * explainable comparison between what the student is looking for and what
 * is verifiably true about the tutor (verification records, declared
 * topics, availability slots, mode preferences, group-size capacity).
 *
 * Weighting (of the total when all criteria are available):
 *   - Module verification: required condition, NOT a weighted component —
 *     a tutor who isn't verified for the requested module is excluded
 *     entirely before this scorer ever runs (enforced by the caller).
 *   - Topic match:            40%  (overlap with explicitly selected topics)
 *   - Availability match:     25%  (tutor has a slot on the preferred day, in the preferred mode)
 *   - Weak-topic match:       20%  (overlap with the student's quiz-diagnosed weak topics)
 *   - Mode preference:        10%  (tutor supports the student's preferred session mode)
 *   - Group-size compatibility: 5% (tutor's max group size covers the requested group size)
 *
 * If a criterion has no input data (e.g. the student didn't select topics,
 * or has no preferred day), that criterion is excluded from both the
 * numerator and denominator — the remaining applicable criteria are
 * renormalized to sum to 100%, per spec: "If some preferences have not been
 * provided, normalise the score using the criteria that are available."
 */

const WEIGHTS = {
  topic: 0.40,
  availability: 0.25,
  weakTopic: 0.20,
  mode: 0.10,
  groupSize: 0.05,
};

function normalizeList(list) {
  return (list || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}

function overlapRatio(wanted, have) {
  const wantedSet = normalizeList(wanted);
  const haveSet = new Set(normalizeList(have));
  if (wantedSet.length === 0) return { applicable: false, score: 0, matched: [] };
  const matched = wantedSet.filter((t) => haveSet.has(t));
  return { applicable: true, score: matched.length / wantedSet.length, matched };
}

/**
 * @param {object} tutor - full tutor profile as returned by tutorService.getFullProfile
 * @param {object} criteria
 * @param {string} [criteria.moduleId] - restricts topic comparisons to this module's topics
 * @param {string[]} [criteria.topics] - explicitly selected topics of interest
 * @param {string[]} [criteria.weakTopics] - topics the student's quiz diagnosis flagged as weak
 * @param {string} [criteria.preferredDay] - e.g. 'Wednesday'
 * @param {string} [criteria.preferredMode] - 'Physical' | 'Online' | 'Both'
 * @param {number} [criteria.groupSize] - requested group size (1 = individual)
 */
function computeMatch(tutor, criteria = {}) {
  const { moduleId, topics, weakTopics, preferredDay, preferredMode, groupSize } = criteria;

  const tutorTopicNames = tutor.topics
    .filter((t) => !moduleId || t.module_id === moduleId)
    .map((t) => t.topic_name);

  const reasons = [];

  // Module verification — required condition, always reported if relevant, never weighted.
  if (moduleId) {
    const verifiedModule = tutor.verified_modules.find((m) => m.id === moduleId);
    if (verifiedModule) {
      reasons.push(`Verified for ${verifiedModule.module_code}`);
    }
  }

  const topicResult = overlapRatio(topics, tutorTopicNames);
  if (topicResult.applicable && topicResult.matched.length > 0) {
    const displayNames = tutor.topics
      .filter((t) => topicResult.matched.includes(t.topic_name.toLowerCase()))
      .map((t) => t.topic_name);
    reasons.push(`Specialises in ${[...new Set(displayNames)].join(', ')}`);
  }

  const weakTopicResult = overlapRatio(weakTopics, tutorTopicNames);
  if (weakTopicResult.applicable && weakTopicResult.matched.length > 0) {
    const displayNames = tutor.topics
      .filter((t) => weakTopicResult.matched.includes(t.topic_name.toLowerCase()))
      .map((t) => t.topic_name);
    reasons.push(`Can help with your weak topic${displayNames.length > 1 ? 's' : ''}: ${[...new Set(displayNames)].join(', ')}`);
  }

  let availabilityResult = { applicable: false, score: 0 };
  if (preferredDay) {
    const daySlots = tutor.availability.filter(
      (a) => a.day_or_date.toLowerCase() === preferredDay.toLowerCase()
    );
    const modeCompatibleSlot = daySlots.find((a) => {
      if (!preferredMode || preferredMode === 'Both') return true;
      return a.session_mode === preferredMode || a.session_mode === 'Both';
    });
    availabilityResult = { applicable: true, score: modeCompatibleSlot ? 1 : 0 };
    if (modeCompatibleSlot) reasons.push(`Available ${preferredDay}`);
  }

  let modeResult = { applicable: false, score: 0 };
  if (preferredMode) {
    let supported;
    if (preferredMode === 'Both') {
      supported = tutor.profile.physical_enabled || tutor.profile.online_enabled;
    } else if (preferredMode === 'Physical') {
      supported = !!tutor.profile.physical_enabled;
    } else if (preferredMode === 'Online') {
      supported = !!tutor.profile.online_enabled;
    } else {
      supported = false;
    }
    modeResult = { applicable: true, score: supported ? 1 : 0 };
    if (supported) reasons.push('Supports your preferred session mode');
  }

  let groupSizeResult = { applicable: false, score: 0 };
  if (groupSize) {
    const compatible = (tutor.profile.maximum_group_size || 1) >= groupSize;
    groupSizeResult = { applicable: true, score: compatible ? 1 : 0 };
    if (compatible) reasons.push(`Supports your group size (${groupSize})`);
  }

  const components = [
    { key: 'topic', weight: WEIGHTS.topic, ...topicResult },
    { key: 'availability', weight: WEIGHTS.availability, ...availabilityResult },
    { key: 'weakTopic', weight: WEIGHTS.weakTopic, ...weakTopicResult },
    { key: 'mode', weight: WEIGHTS.mode, ...modeResult },
    { key: 'groupSize', weight: WEIGHTS.groupSize, ...groupSizeResult },
  ];

  const applicableComponents = components.filter((c) => c.applicable);
  const totalApplicableWeight = applicableComponents.reduce((sum, c) => sum + c.weight, 0);

  let percentage;
  if (totalApplicableWeight === 0) {
    // Nothing to evaluate beyond the required module-verification gate — no
    // unmet criteria means nothing is counting against this tutor.
    percentage = 100;
  } else {
    const weightedSum = applicableComponents.reduce((sum, c) => sum + c.weight * c.score, 0);
    percentage = Math.round((weightedSum / totalApplicableWeight) * 100);
  }

  return {
    score: percentage,
    reasons,
    breakdown: components.map((c) => ({
      criterion: c.key,
      applicable: c.applicable,
      score: Math.round(c.score * 100),
      weight: Math.round(c.weight * 100),
    })),
  };
}

module.exports = { computeMatch, WEIGHTS };
