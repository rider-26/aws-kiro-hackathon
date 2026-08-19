const recognitionService = require('../src/services/recognitionService');

const RULES = {
  min_participants: 2,
  min_duration_minutes: 30,
  require_verified_attendance: true,
  approval_note: 'Subject to lecturer approval.',
};

function participant({ checkedIn = false, confirmed = false } = {}) {
  return {
    id: `p_${Math.random()}`,
    check_in_time: checkedIn ? '2026-08-19T15:05:00.000Z' : null,
    completion_confirmed: confirmed,
  };
}

describe('recognitionService.evaluate — never auto-awards (spec section 22)', () => {
  it('reports Pending Lecturer Approval when every criterion is met', () => {
    const session = { status: 'Completed', attendance_verified: true, duration_minutes: 45 };
    const participants = [
      participant({ checkedIn: true, confirmed: true }),
      participant({ checkedIn: true, confirmed: true }),
    ];

    const result = recognitionService.evaluate(session, participants, RULES);

    expect(result.all_criteria_met).toBe(true);
    expect(result.status).toBe('Pending Lecturer Approval');
    // Explicitly assert the app never claims to have granted anything.
    expect(result.status).not.toMatch(/award/i);
    expect(result.status).not.toMatch(/granted/i);
  });

  it('never reports eligibility for a session that is not Completed', () => {
    const session = { status: 'In Progress', attendance_verified: true, duration_minutes: 60 };
    const participants = [
      participant({ checkedIn: true, confirmed: true }),
      participant({ checkedIn: true, confirmed: true }),
    ];

    const result = recognitionService.evaluate(session, participants, RULES);
    expect(result.all_criteria_met).toBe(false);
    expect(result.status).toBe('Not Eligible');
  });

  it('fails the attendance criterion when attendance is not verified', () => {
    const session = { status: 'Completed', attendance_verified: false, duration_minutes: 45 };
    const participants = [
      participant({ checkedIn: true }),
      participant({ checkedIn: true }),
    ];

    const result = recognitionService.evaluate(session, participants, RULES);
    const attendance = result.criteria.find((c) => c.key === 'attendance');

    expect(attendance.met).toBe(false);
    expect(attendance.value).toBe('Not Verified');
    expect(result.status).toBe('Not Eligible');
  });

  it('passes the attendance criterion when verification is not required', () => {
    const session = { status: 'Completed', attendance_verified: false, duration_minutes: 45 };
    const participants = [
      participant({ checkedIn: true }),
      participant({ checkedIn: true }),
    ];

    const result = recognitionService.evaluate(session, participants, {
      ...RULES, require_verified_attendance: false,
    });

    expect(result.criteria.find((c) => c.key === 'attendance').met).toBe(true);
    expect(result.status).toBe('Pending Lecturer Approval');
  });

  it('fails the participants criterion when too few checked in', () => {
    const session = { status: 'Completed', attendance_verified: true, duration_minutes: 45 };
    const participants = [participant({ checkedIn: true, confirmed: true }), participant()];

    const result = recognitionService.evaluate(session, participants, RULES);
    const criterion = result.criteria.find((c) => c.key === 'participants');

    expect(criterion.met).toBe(false);
    expect(criterion.value).toBe('1 checked in');
    expect(criterion.requirement).toBe('At least 2');
  });

  it('fails the duration criterion when the session was too short', () => {
    const session = { status: 'Completed', attendance_verified: true, duration_minutes: 20 };
    const participants = [
      participant({ checkedIn: true, confirmed: true }),
      participant({ checkedIn: true, confirmed: true }),
    ];

    const result = recognitionService.evaluate(session, participants, RULES);
    const criterion = result.criteria.find((c) => c.key === 'duration');

    expect(criterion.met).toBe(false);
    expect(criterion.value).toBe('20 min');
    expect(criterion.requirement).toBe('At least 30 min');
  });

  it('treats the duration threshold as inclusive', () => {
    const session = { status: 'Completed', attendance_verified: true, duration_minutes: 30 };
    const participants = [
      participant({ checkedIn: true, confirmed: true }),
      participant({ checkedIn: true, confirmed: true }),
    ];

    const result = recognitionService.evaluate(session, participants, RULES);
    expect(result.criteria.find((c) => c.key === 'duration').met).toBe(true);
  });

  it('echoes the applied thresholds so the UI can show what was evaluated', () => {
    const session = { status: 'Completed', attendance_verified: true, duration_minutes: 45 };
    const result = recognitionService.evaluate(session, [], RULES);

    expect(result.rules_applied).toEqual({
      min_participants: 2,
      min_duration_minutes: 30,
      require_verified_attendance: true,
    });
  });

  it('always carries the lecturer-approval note', () => {
    const session = { status: 'Completed', attendance_verified: true, duration_minutes: 45 };
    const result = recognitionService.evaluate(session, [], RULES);
    expect(result.approval_note).toBeTruthy();
  });

  it('defaults note text makes clear PeerLink does not award points', () => {
    expect(recognitionService.DEFAULT_RULES.approval_note).toMatch(/does not award/i);
  });

  it('reports all three required criteria from the specification', () => {
    const result = recognitionService.evaluate({ status: 'Completed' }, [], RULES);
    expect(result.criteria.map((c) => c.label)).toEqual([
      'Attendance', 'Minimum Participants', 'Minimum Duration',
    ]);
  });
});
