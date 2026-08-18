const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Converts 'HH:MM' to minutes since midnight for easy comparison. */
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

/** True if [startA,endA) overlaps [startB,endB) — both 'HH:MM' strings. */
function rangesOverlap(startA, endA, startB, endB) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

/** Returns the weekday name (e.g. 'Wednesday') for a 'YYYY-MM-DD' date string, timezone-safe. */
function dayOfWeek(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return DAY_NAMES[date.getUTCDay()];
}

/** True if an availability slot's mode is compatible with a requested session mode. */
function modeCompatible(slotMode, requestedMode) {
  if (!requestedMode) return true;
  if (slotMode === 'Both') return true;
  return slotMode === requestedMode;
}

/**
 * True if [start,end) on `date` fits entirely within the given availability
 * slot, matching either a repeating weekday name or an exact date, and with
 * a compatible session mode.
 */
function fitsWithinSlot(slot, { date, start_time, end_time, session_mode }) {
  const dayName = dayOfWeek(date);
  const dayMatches = slot.day_or_date === dayName || slot.day_or_date === date;
  if (!dayMatches) return false;
  if (!modeCompatible(slot.session_mode, session_mode)) return false;
  return toMinutes(slot.start_time) <= toMinutes(start_time) && toMinutes(slot.end_time) >= toMinutes(end_time);
}

module.exports = { toMinutes, rangesOverlap, dayOfWeek, modeCompatible, fitsWithinSlot, DAY_NAMES };
