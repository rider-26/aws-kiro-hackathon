const { computeMatch } = require('../src/services/matchService');

function makeTutor(overrides = {}) {
  return {
    verified_modules: [{ id: 'module_it2513', module_code: 'IT2513' }],
    topics: [
      { module_id: 'module_it2513', topic_name: 'Digital Signatures' },
      { module_id: 'module_it2513', topic_name: 'RSA' },
      { module_id: 'module_it2513', topic_name: 'Hashing' },
      { module_id: 'module_it2513', topic_name: 'Certificates' },
    ],
    availability: [
      { day_or_date: 'Monday', start_time: '15:00', end_time: '17:00', session_mode: 'Both' },
      { day_or_date: 'Wednesday', start_time: '13:00', end_time: '16:00', session_mode: 'Both' },
    ],
    profile: {
      physical_enabled: true,
      online_enabled: true,
      maximum_group_size: 5,
    },
    ...overrides,
  };
}

describe('computeMatch — full criteria (all weights applicable)', () => {
  it('scores 100% when every criterion is fully satisfied', () => {
    const tutor = makeTutor();
    const result = computeMatch(tutor, {
      moduleId: 'module_it2513',
      topics: ['Digital Signatures'],
      weakTopics: ['Digital Signatures', 'Certificates'],
      preferredDay: 'Wednesday',
      preferredMode: 'Online',
      groupSize: 2,
    });

    expect(result.score).toBe(100);
    expect(result.reasons).toContain('Verified for IT2513');
    expect(result.reasons.some((r) => r.includes('Digital Signatures'))).toBe(true);
    expect(result.reasons).toContain('Available Wednesday');
    expect(result.reasons).toContain('Supports your preferred session mode');
  });

  it('produces the spec example scenario roughly matching "91% Match" style output', () => {
    // Verified + specialises in Digital Signatures + available Wednesday + supports mode,
    // but NOT a full weak-topic overlap (only 1 of 2 weak topics covered) and no group size given.
    const tutor = makeTutor();
    const result = computeMatch(tutor, {
      moduleId: 'module_it2513',
      topics: ['Digital Signatures'],
      weakTopics: ['Digital Signatures', 'Networking Basics'], // only 1/2 covered
      preferredDay: 'Wednesday',
      preferredMode: 'Online',
      // no groupSize provided -> renormalized without it
    });

    // topic 40% * 1.0 + availability 25% * 1.0 + weakTopic 20% * 0.5 + mode 10% * 1.0
    // total applicable weight = 40+25+20+10 = 95; weighted = 40+25+10+10 = 85; 85/95 = 89.47% -> 89
    expect(result.score).toBe(89);
  });

  it('scores 0 for topic/availability/mode when none match, but still respects renormalization', () => {
    const tutor = makeTutor({
      availability: [{ day_or_date: 'Friday', start_time: '10:00', end_time: '12:00', session_mode: 'Physical' }],
      profile: { physical_enabled: true, online_enabled: false, maximum_group_size: 2 },
    });
    const result = computeMatch(tutor, {
      moduleId: 'module_it2513',
      topics: ['Machine Learning'], // tutor doesn't teach this
      preferredDay: 'Wednesday', // tutor not available this day
      preferredMode: 'Online', // tutor doesn't support online
    });

    expect(result.score).toBe(0);
  });
});

describe('computeMatch — partial criteria (renormalization)', () => {
  it('returns 100 when no optional criteria are provided at all (nothing counts against the tutor)', () => {
    const tutor = makeTutor();
    const result = computeMatch(tutor, { moduleId: 'module_it2513' });
    expect(result.score).toBe(100);
  });

  it('renormalizes using only topic match when that is the only criterion supplied', () => {
    const tutor = makeTutor();
    const result = computeMatch(tutor, { moduleId: 'module_it2513', topics: ['Digital Signatures'] });
    // topic is the only applicable component and it's a full match -> 100%
    expect(result.score).toBe(100);
  });

  it('renormalizes correctly when topic match is partial and it is the only criterion', () => {
    const tutor = makeTutor();
    const result = computeMatch(tutor, { moduleId: 'module_it2513', topics: ['Digital Signatures', 'Nonexistent Topic'] });
    // 1 of 2 requested topics matched -> 50%
    expect(result.score).toBe(50);
  });

  it('renormalizes correctly with two applicable criteria of different weights', () => {
    const tutor = makeTutor();
    const result = computeMatch(tutor, {
      moduleId: 'module_it2513',
      topics: ['Digital Signatures'], // 40% weight, full match
      preferredMode: 'Physical', // 10% weight, tutor supports physical -> full match
    });
    // Both fully matched -> renormalized score should still be 100
    expect(result.score).toBe(100);
  });
});

describe('computeMatch — reasons/explanation output', () => {
  it('includes a human-readable breakdown array with all 5 weighted criteria', () => {
    const tutor = makeTutor();
    const result = computeMatch(tutor, { moduleId: 'module_it2513', topics: ['RSA'] });
    const keys = result.breakdown.map((b) => b.criterion);
    expect(keys).toEqual(['topic', 'availability', 'weakTopic', 'mode', 'groupSize']);
  });

  it('does not fabricate a reason for a criterion that was not satisfied', () => {
    const tutor = makeTutor();
    const result = computeMatch(tutor, { moduleId: 'module_it2513', preferredDay: 'Sunday' });
    expect(result.reasons.some((r) => r.includes('Available Sunday'))).toBe(false);
  });
});
