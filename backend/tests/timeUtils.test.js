const { rangesOverlap, dayOfWeek, fitsWithinSlot } = require('../src/utils/timeUtils');

describe('rangesOverlap', () => {
  it('detects a true overlap', () => {
    expect(rangesOverlap('15:00', '17:00', '16:00', '18:00')).toBe(true);
  });
  it('treats back-to-back ranges as non-overlapping', () => {
    expect(rangesOverlap('15:00', '16:00', '16:00', '17:00')).toBe(false);
  });
  it('detects full containment as overlap', () => {
    expect(rangesOverlap('15:00', '18:00', '16:00', '17:00')).toBe(true);
  });
  it('returns false for clearly separate ranges', () => {
    expect(rangesOverlap('09:00', '10:00', '15:00', '16:00')).toBe(false);
  });
});

describe('dayOfWeek', () => {
  it('resolves a known date to the right weekday', () => {
    // 2026-08-19 is a Wednesday.
    expect(dayOfWeek('2026-08-19')).toBe('Wednesday');
  });
});

describe('fitsWithinSlot', () => {
  const wedSlot = { day_or_date: 'Wednesday', start_time: '13:00', end_time: '16:00', session_mode: 'Both' };

  it('accepts a request fully inside a repeating weekday slot', () => {
    expect(fitsWithinSlot(wedSlot, { date: '2026-08-19', start_time: '15:00', end_time: '16:00', session_mode: 'Online' })).toBe(true);
  });

  it('rejects a request that runs past the end of the slot', () => {
    expect(fitsWithinSlot(wedSlot, { date: '2026-08-19', start_time: '15:00', end_time: '17:00', session_mode: 'Online' })).toBe(false);
  });

  it('rejects a request on a different weekday', () => {
    // 2026-08-20 is a Thursday.
    expect(fitsWithinSlot(wedSlot, { date: '2026-08-20', start_time: '15:00', end_time: '16:00' })).toBe(false);
  });

  it('rejects a mode the slot does not support', () => {
    const physicalOnly = { ...wedSlot, session_mode: 'Physical' };
    expect(fitsWithinSlot(physicalOnly, { date: '2026-08-19', start_time: '15:00', end_time: '16:00', session_mode: 'Online' })).toBe(false);
  });
});
