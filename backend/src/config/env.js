// Required BEFORE dotenv on purpose: secrets.js snapshots which variables were
// genuinely exported in the shell, so it can tell those apart from ones dotenv
// copies out of backend/.env. Without that snapshot the two are identical.
const secrets = require('./secrets');

require('dotenv').config();

function required(name, fallback = undefined) {
  const val = process.env[name] ?? fallback;
  return val;
}

const path = require('path');

/**
 * Which storage engine the data layer talks to.
 *
 * 'sqlite'   — local file database, zero AWS setup. What local dev uses.
 * 'dynamodb' — the deployed engine, and what the test suite mocks.
 *
 * Defaults to dynamodb so the Lambda deployment and the existing test mocks
 * keep working untouched; backend/.env sets sqlite for local development.
 * Tests force dynamodb regardless, since they mock the AWS SDK client.
 */
/** The Vite dev server, and the loopback spelling of it browsers may use. */
const LOCAL_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/**
 * Origins allowed to call the API from a browser.
 *
 * FRONTEND_ORIGIN accepts a COMMA-SEPARATED list, so a deployed URL and local
 * dev can both be permitted without swapping config between them.
 *
 * Outside production the local dev origins are ALWAYS included. That's
 * deliberate: a CORS mismatch is invisible server-side (the browser blocks the
 * response after the request succeeded, so the server logs a 200 while the page
 * reports a network failure) and it is easy to point FRONTEND_ORIGIN at a
 * deployed URL and lose local development with no obvious cause. Production
 * gets exactly what it was configured with and nothing more.
 */
function resolveAllowedOrigins() {
  const configured = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const isProduction = (process.env.NODE_ENV || 'development') === 'production';
  if (isProduction) {
    return configured.length > 0 ? configured : LOCAL_DEV_ORIGINS;
  }

  return [...new Set([...configured, ...LOCAL_DEV_ORIGINS])];
}

function resolveDeepseekKey() {
  if ((process.env.NODE_ENV || 'development') === 'test') return undefined;
  // Prefers ~/.peerlink/secrets.env over backend/.env — see config/secrets.js.
  return secrets.get('DEEPSEEK_API_KEY');
}

function resolveDbDriver() {
  if ((process.env.NODE_ENV || 'development') === 'test') return 'dynamodb';
  const driver = (process.env.DB_DRIVER || 'dynamodb').toLowerCase();
  if (!['sqlite', 'dynamodb'].includes(driver)) {
    throw new Error(`DB_DRIVER must be 'sqlite' or 'dynamodb', received '${driver}'`);
  }
  return driver;
}

module.exports = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  dbDriver: resolveDbDriver(),
  // Resolved relative to /backend so the path doesn't depend on cwd.
  sqlitePath: process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'peerlink.db'),

  /**
   * Where uploaded study material goes.
   *   local — disk, under uploadsPath. No AWS needed; the default.
   *   s3    — presigned PUT/GET against S3. Set by the CDK stack on deploy.
   * Lambda's filesystem is ephemeral and not shared between invocations, so
   * 'local' is never correct for the deployed app.
   */
  storageDriver: (process.env.STORAGE_DRIVER || 'local').toLowerCase() === 's3' ? 's3' : 'local',
  uploadsPath: process.env.UPLOADS_PATH || path.join(__dirname, '..', '..', 'data', 'uploads'),

  aws: {
    region: process.env.AWS_REGION || 'ap-southeast-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    // Required by temporary credentials (AWS Academy / Learner Lab, STS,
    // assumed roles). Omitted for permanent IAM user keys.
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },

  tables: {
    users: process.env.TABLE_USERS || 'PeerLink_Users',
    tutorProfiles: process.env.TABLE_TUTOR_PROFILES || 'PeerLink_TutorProfiles',
    modules: process.env.TABLE_MODULES || 'PeerLink_Modules',
    tutorVerifications: process.env.TABLE_TUTOR_VERIFICATIONS || 'PeerLink_TutorVerifications',
    tutorTopics: process.env.TABLE_TUTOR_TOPICS || 'PeerLink_TutorTopics',
    tutorAvailability: process.env.TABLE_TUTOR_AVAILABILITY || 'PeerLink_TutorAvailability',
    savedTutors: process.env.TABLE_SAVED_TUTORS || 'PeerLink_SavedTutors',
    bookings: process.env.TABLE_BOOKINGS || 'PeerLink_Bookings',
    sessions: process.env.TABLE_SESSIONS || 'PeerLink_TutoringSessions',
    sessionParticipants: process.env.TABLE_SESSION_PARTICIPANTS || 'PeerLink_SessionParticipants',
    chatMessages: process.env.TABLE_CHAT_MESSAGES || 'PeerLink_ChatMessages',
    studyMaterials: process.env.TABLE_STUDY_MATERIALS || 'PeerLink_StudyMaterials',
    quizzes: process.env.TABLE_QUIZZES || 'PeerLink_Quizzes',
    quizQuestions: process.env.TABLE_QUIZ_QUESTIONS || 'PeerLink_QuizQuestions',
    quizAttempts: process.env.TABLE_QUIZ_ATTEMPTS || 'PeerLink_QuizAttempts',
    quizResponses: process.env.TABLE_QUIZ_RESPONSES || 'PeerLink_QuizResponses',
    topicPerformance: process.env.TABLE_TOPIC_PERFORMANCE || 'PeerLink_TopicPerformance',
    reviews: process.env.TABLE_REVIEWS || 'PeerLink_Reviews',
    userReports: process.env.TABLE_USER_REPORTS || 'PeerLink_UserReports',
    notifications: process.env.TABLE_NOTIFICATIONS || 'PeerLink_Notifications',
    recognitionRules: process.env.TABLE_RECOGNITION_RULES || 'PeerLink_RecognitionRules',
    connections: process.env.TABLE_CONNECTIONS || 'PeerLink_Connections',
  },

  s3Bucket: process.env.S3_BUCKET || 'peerlink-nyp-uploads',

  deepseek: {
    // Withheld under test so the suite can NEVER make a live API call.
    //
    // config/env.js loads .env, so once a real key is present locally the tests
    // would otherwise reach the network: slow, flaky, billable, and it silently
    // invalidates the tests that assert the seeded-fallback path. Live
    // verification is the job of `npm run smoke:deepseek`, which runs against a
    // started server and deliberately fails if the key is absent.
    apiKey: resolveDeepseekKey(),
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },

  websocketApiEndpoint: process.env.WEBSOCKET_API_ENDPOINT || '',

  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  allowedOrigins: resolveAllowedOrigins(),
};
