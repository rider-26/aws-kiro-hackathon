const env = require('./env');

/**
 * Declarative map of every secondary-index access pattern in the app.
 *
 * This exists because the same information is needed in three places and was
 * previously only implicit in the repository call sites:
 *
 *  1. The SQLite driver needs to know which document attributes to index, and
 *     which index has a sort key so it can reproduce DynamoDB's implicit
 *     ordering (chatMessageRepository relies on messages coming back ordered
 *     by created_date — in SQL that requires an explicit ORDER BY).
 *  2. DynamoDB provisioning needs the exact GSI names and key schema.
 *  3. It documents every query the app can make, in one readable place.
 *
 * Keyed by resolved table name so a repository can look itself up with the
 * name it was constructed with.
 */
const INDEXES = {
  [env.tables.users]: {
    'email-index': { pk: 'email' },
  },
  [env.tables.tutorProfiles]: {
    'userId-index': { pk: 'user_id' },
  },
  [env.tables.modules]: {
    'moduleCode-index': { pk: 'module_code' },
  },
  [env.tables.tutorVerifications]: {
    'tutorId-index': { pk: 'tutor_id' },
    'moduleId-index': { pk: 'module_id' },
  },
  [env.tables.tutorTopics]: {
    'tutorId-index': { pk: 'tutor_id' },
  },
  [env.tables.tutorAvailability]: {
    'tutorId-index': { pk: 'tutor_id' },
  },
  [env.tables.savedTutors]: {
    'studentId-index': { pk: 'student_id' },
  },
  [env.tables.bookings]: {
    'studentId-index': { pk: 'student_id' },
    'tutorId-index': { pk: 'tutor_id' },
  },
  [env.tables.sessions]: {
    'tutorId-index': { pk: 'tutor_id' },
    'bookingId-index': { pk: 'booking_id' },
  },
  [env.tables.sessionParticipants]: {
    'sessionId-index': { pk: 'session_id' },
    'studentId-index': { pk: 'student_id' },
  },
  [env.tables.chatMessages]: {
    // Sort key matters: chat history must come back oldest-first.
    'sessionId-createdDate-index': { pk: 'session_id', sk: 'created_date' },
  },
  [env.tables.studyMaterials]: {
    'studentId-index': { pk: 'student_id' },
  },
  [env.tables.quizzes]: {
    'studentId-index': { pk: 'student_id' },
  },
  [env.tables.quizQuestions]: {
    'quizId-index': { pk: 'quiz_id' },
  },
  [env.tables.quizAttempts]: {
    'quizId-index': { pk: 'quiz_id' },
    'studentId-index': { pk: 'student_id' },
  },
  [env.tables.quizResponses]: {
    'attemptId-index': { pk: 'attempt_id' },
  },
  [env.tables.topicPerformance]: {
    'studentId-moduleId-index': { pk: 'student_id', sk: 'module_id' },
  },
  [env.tables.reviews]: {
    'sessionId-index': { pk: 'session_id' },
    'tutorId-index': { pk: 'tutor_id' },
  },
  [env.tables.userReports]: {
    'reporterId-index': { pk: 'reporter_id' },
    'reportedUserId-index': { pk: 'reported_user_id' },
  },
  [env.tables.notifications]: {
    'userId-createdDate-index': { pk: 'user_id', sk: 'created_date' },
  },
  // RecognitionRules is a single well-known row read by id — no index needed.
  [env.tables.recognitionRules]: {},
  [env.tables.connections]: {
    'userId-index': { pk: 'user_id' },
  },
};

/** Every table the app uses, in creation order (no FKs, so order is cosmetic). */
const ALL_TABLES = Object.keys(INDEXES);

function indexesFor(tableName) {
  return INDEXES[tableName] || {};
}

function indexMeta(tableName, indexName) {
  return indexesFor(tableName)[indexName] || null;
}

module.exports = { INDEXES, ALL_TABLES, indexesFor, indexMeta };
