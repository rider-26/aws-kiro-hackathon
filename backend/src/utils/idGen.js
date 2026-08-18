const { v4: uuidv4 } = require('uuid');

/**
 * Generates a prefixed unique id, e.g. idGen('booking') -> 'booking_3f2a...'
 * Prefixes make ids self-describing in logs and easier to debug across tables.
 */
function idGen(prefix) {
  return `${prefix}_${uuidv4()}`;
}

module.exports = idGen;
