const recognitionRulesRepository = require('../repositories/recognitionRulesRepository');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Recognition eligibility (spec section 22).
 *
 * IMPORTANT FRAMING: this feature is a configurable *proposal* only. The
 * platform computes whether a session met the configured thresholds and then
 * reports "Pending Lecturer Approval". It never awards CCA points, and nothing
 * here claims any institutional integration — a lecturer/admin remains the
 * decision maker (business rule 14).
 */

const DEFAULT_RULES = {
  min_participants: 1,
  min_duration_minutes: 30,
  require_verified_attendance: true,
  // Deliberately wordy: this string is surfaced verbatim in the UI so the
  // proposal framing travels with the data.
  approval_note: 'Recognition is proposed by the platform and remains subject to lecturer approval. PeerLink does not award CCA points.',
};

const EDITABLE_FIELDS = ['min_participants', 'min_duration_minutes', 'require_verified_attendance'];

/** Reads the active rules, falling back to defaults when none are stored yet. */
async function getRules() {
  const stored = await recognitionRulesRepository.getById(recognitionRulesRepository.SINGLETON_ID);
  if (!stored) return { id: recognitionRulesRepository.SINGLETON_ID, ...DEFAULT_RULES, is_default: true };
  return { ...DEFAULT_RULES, ...stored, is_default: false };
}

/** Admin-only update of the thresholds. */
async function updateRules(adminId, patch) {
  const safePatch = {};

  for (const field of EDITABLE_FIELDS) {
    if (patch[field] === undefined) continue;

    if (field === 'require_verified_attendance') {
      safePatch[field] = !!patch[field];
      continue;
    }

    const value = Number(patch[field]);
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiError(400, `${field} must be a non-negative number`);
    }
    safePatch[field] = Math.round(value);
  }

  if (Object.keys(safePatch).length === 0) {
    throw new ApiError(400, `Provide at least one of: ${EDITABLE_FIELDS.join(', ')}`);
  }

  const existing = await recognitionRulesRepository.getById(recognitionRulesRepository.SINGLETON_ID);
  const now = new Date().toISOString();

  if (!existing) {
    return recognitionRulesRepository.create({
      id: recognitionRulesRepository.SINGLETON_ID,
      ...DEFAULT_RULES,
      ...safePatch,
      updated_by: adminId,
      updated_date: now,
    });
  }

  return recognitionRulesRepository.update(recognitionRulesRepository.SINGLETON_ID, {
    ...safePatch,
    updated_by: adminId,
    updated_date: now,
  });
}

/**
 * Evaluates one session against the active rules.
 *
 * @returns criteria breakdown plus an overall status that is either
 *          'Not Eligible' or 'Pending Lecturer Approval' — never 'Awarded'.
 */
function evaluate(session, participants, rules) {
  const checkedIn = participants.filter((p) => !!p.check_in_time);
  const confirmed = checkedIn.filter((p) => p.completion_confirmed);

  const attendance_verified = !!session.attendance_verified;
  const duration_minutes = session.duration_minutes || 0;

  const criteria = [
    {
      key: 'attendance',
      label: 'Attendance',
      met: rules.require_verified_attendance ? attendance_verified : true,
      value: attendance_verified ? 'Verified' : 'Not Verified',
      requirement: rules.require_verified_attendance ? 'Verified attendance required' : 'Not required',
    },
    {
      key: 'participants',
      label: 'Minimum Participants',
      met: checkedIn.length >= rules.min_participants,
      value: `${checkedIn.length} checked in`,
      requirement: `At least ${rules.min_participants}`,
    },
    {
      key: 'duration',
      label: 'Minimum Duration',
      met: duration_minutes >= rules.min_duration_minutes,
      value: `${duration_minutes} min`,
      requirement: `At least ${rules.min_duration_minutes} min`,
    },
  ];

  const allMet = session.status === 'Completed' && criteria.every((c) => c.met);

  return {
    criteria,
    all_criteria_met: allMet,
    // Terminology fixed by spec section 22 — no automatic awarding.
    status: allMet ? 'Pending Lecturer Approval' : 'Not Eligible',
    rules_applied: {
      min_participants: rules.min_participants,
      min_duration_minutes: rules.min_duration_minutes,
      require_verified_attendance: rules.require_verified_attendance,
    },
    approval_note: rules.approval_note || DEFAULT_RULES.approval_note,
    confirmed_participants: confirmed.length,
    checked_in_participants: checkedIn.length,
  };
}

/** Convenience wrapper that loads the current rules then evaluates. */
async function evaluateSession(session, participants) {
  const rules = await getRules();
  return evaluate(session, participants, rules);
}

module.exports = {
  getRules,
  updateRules,
  evaluate,
  evaluateSession,
  DEFAULT_RULES,
  EDITABLE_FIELDS,
};
