const { computeImprovement } = require('../src/services/progressService');

function attempt(percentage, score, total = 10, date = '2026-08-18T10:00:00.000Z') {
  return { id: `a_${percentage}`, percentage, score, total_questions: total, completed_date: date };
}

describe('computeImprovement — spec section 32', () => {
  it('returns nulls when there is no history', () => {
    expect(computeImprovement([])).toEqual({ latest: null, previous: null, delta: null });
  });

  it('returns no delta after only one attempt', () => {
    const result = computeImprovement([attempt(70, 7)]);
    expect(result.latest.percentage).toBe(70);
    expect(result.previous).toBeNull();
    expect(result.delta).toBeNull();
  });

  it('computes the exact +20 point gain from the specification (7/10 then 9/10)', () => {
    // History is oldest-first, matching getAttemptHistory's ordering.
    const result = computeImprovement([attempt(70, 7), attempt(90, 9)]);

    expect(result.previous.score).toBe(7);
    expect(result.latest.score).toBe(9);
    expect(result.delta).toBe(20);
  });

  it('reports a negative delta when the score drops', () => {
    const result = computeImprovement([attempt(90, 9), attempt(60, 6)]);
    expect(result.delta).toBe(-30);
  });

  it('reports zero when the score is unchanged', () => {
    const result = computeImprovement([attempt(70, 7), attempt(70, 7)]);
    expect(result.delta).toBe(0);
  });

  it('compares only the two most recent attempts', () => {
    const result = computeImprovement([attempt(20, 2), attempt(50, 5), attempt(80, 8)]);
    expect(result.previous.percentage).toBe(50);
    expect(result.latest.percentage).toBe(80);
    expect(result.delta).toBe(30);
  });

  it('treats a missing percentage as zero rather than producing NaN', () => {
    const result = computeImprovement([{ id: 'a', score: 0, total_questions: 10 }, attempt(50, 5)]);
    expect(result.delta).toBe(50);
    expect(Number.isNaN(result.delta)).toBe(false);
  });
});
