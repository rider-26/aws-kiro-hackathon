/* eslint-disable no-console */
require('dotenv').config();

/**
 * Live end-to-end check against a RUNNING backend, exercising the real data
 * layer rather than mocks. Every previous verification in this project went
 * through aws-sdk-client-mock, so this is the first test that proves the
 * storage driver, seed data and HTTP layer work together.
 *
 * Usage: npm run smoke:api   (with `npm run dev` already running)
 */

const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const PASSWORD = 'demo1234';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, body: json };
}

async function login(email) {
  const res = await api('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  return { token: res.body?.data?.token, user: res.body?.data?.user, status: res.status };
}

async function main() {
  console.log(`\nPeerLink API smoke test against ${BASE}\n`);

  const health = await api('/health');
  check('health endpoint responds 200', health.status === 200, `got ${health.status}`);

  // --- Auth for all three roles ---------------------------------------------
  console.log('\nAuth');
  const tutee = await login('jinyu@student.demo');
  check('tutee logs in', tutee.status === 200 && !!tutee.token, `status ${tutee.status}`);
  check('tutee role is Tutee', tutee.user?.role === 'Tutee', `got ${tutee.user?.role}`);
  check('login never returns password_hash', tutee.user?.password_hash === undefined);

  const tutor = await login('alex@tutor.demo');
  check('tutor logs in', tutor.status === 200 && !!tutor.token, `status ${tutor.status}`);
  check('tutor role is Tutor', tutor.user?.role === 'Tutor', `got ${tutor.user?.role}`);

  const admin = await login('lecturer@admin.demo');
  check('admin logs in', admin.status === 200 && !!admin.token, `status ${admin.status}`);
  check('admin role is Admin', admin.user?.role === 'Admin', `got ${admin.user?.role}`);

  const badPassword = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'jinyu@student.demo', password: 'wrong-password' },
  });
  check('wrong password is rejected', badPassword.status === 401, `got ${badPassword.status}`);

  // --- Tutee dashboard: the spec's improvement scenario ---------------------
  console.log('\nTutee dashboard (spec section 8)');
  const dash = await api('/api/dashboard', { token: tutee.token });
  check('dashboard responds 200', dash.status === 200, `got ${dash.status}`);
  check(
    'seeded first attempt is 7/10',
    dash.body?.data?.latest_attempt?.percentage === 70,
    `got ${dash.body?.data?.latest_attempt?.percentage}`
  );
  const weak = dash.body?.data?.weak_topics || [];
  check('two weak topics identified', weak.length === 2, `got ${weak.length}`);
  check(
    'weakest topic first is Certificates at 40%',
    weak[0]?.topic === 'Certificates' && weak[0]?.score_percentage === 40,
    `got ${weak[0]?.topic} ${weak[0]?.score_percentage}%`
  );
  check(
    'a tutor is recommended from the weak topics',
    !!dash.body?.data?.recommended_tutor,
    'no recommended_tutor'
  );

  // --- Tutor search + match scoring ----------------------------------------
  console.log('\nFind Tutors (match scoring + verified-only gate)');
  const modules = await api('/api/modules', { token: tutee.token });
  const it2513 = (modules.body?.data?.modules || []).find((m) => m.module_code === 'IT2513');
  check('IT2513 module exists', !!it2513);

  const search = await api(
    `/api/tutors/search?moduleId=${it2513?.id}&weakTopics=Certificates,Digital%20Signatures`,
    { token: tutee.token }
  );
  const results = search.body?.data?.tutors || [];
  check('search returns tutors', results.length > 0, `got ${results.length}`);
  check(
    'every result is verified for the module',
    results.every((t) => (t.verified_modules || []).some((m) => m.id === it2513?.id)),
    'a result was not verified for IT2513'
  );
  check(
    'results carry a match score',
    results.every((t) => typeof t.match?.score === 'number'),
    'a result had no match score'
  );
  check(
    'results are sorted by match score descending',
    results.every((t, i) => i === 0 || results[i - 1].match.score >= t.match.score)
  );
  check(
    'match reasons are populated',
    (results[0]?.match?.reasons || []).length > 0,
    'top result had no reasons'
  );
  // Daniel Koh is seeded Pending for IT2513 specifically so this gate is testable.
  check(
    'a Pending-verification tutor is excluded',
    !results.some((t) => t.user?.full_name === 'Daniel Koh'),
    'Daniel Koh (Pending) leaked into verified results'
  );

  // --- Group sessions ------------------------------------------------------
  console.log('\nGroup sessions');
  const groups = await api('/api/sessions/group', { token: tutee.token });
  const groupList = groups.body?.data?.sessions || [];
  check('group sessions are browsable', groupList.length === 3, `got ${groupList.length}`);
  const crypto = groupList.find((s) => (s.title || '').includes('Crypto Revision'));
  check(
    'seeded group session shows 2 / 5 occupancy',
    crypto?.participant_count === 2 && crypto?.capacity === 5,
    `got ${crypto?.participant_count} / ${crypto?.capacity}`
  );

  // --- Private learning data is not cross-readable --------------------------
  console.log('\nAccess control');
  const tutorOnStudentProgress = await api('/api/progress', { token: tutor.token });
  check('tutor cannot read student progress', tutorOnStudentProgress.status === 403, `got ${tutorOnStudentProgress.status}`);

  const studentOnAdminReports = await api('/api/admin/reports', { token: tutee.token });
  check('tutee cannot read the moderation queue', studentOnAdminReports.status === 403, `got ${studentOnAdminReports.status}`);

  const unauthenticated = await api('/api/dashboard');
  check('unauthenticated request is rejected', unauthenticated.status === 401, `got ${unauthenticated.status}`);

  // --- Admin oversight ------------------------------------------------------
  console.log('\nAdmin');
  const adminDash = await api('/api/admin/dashboard', { token: admin.token });
  check('admin dashboard responds 200', adminDash.status === 200, `got ${adminDash.status}`);
  check(
    'counts 3 students and 5 tutors',
    adminDash.body?.data?.stats?.total_students === 3 && adminDash.body?.data?.stats?.total_tutors === 5,
    `got ${adminDash.body?.data?.stats?.total_students} students / ${adminDash.body?.data?.stats?.total_tutors} tutors`
  );
  check(
    'a pending verification is waiting for the admin',
    adminDash.body?.data?.stats?.pending_verifications >= 1,
    `got ${adminDash.body?.data?.stats?.pending_verifications}`
  );

  const reports = await api('/api/admin/reports', { token: admin.token });
  check('moderation queue has the 3 seeded reports', (reports.body?.data?.reports || []).length === 3,
    `got ${(reports.body?.data?.reports || []).length}`);
  check(
    'queue puts Pending first',
    reports.body?.data?.reports?.[0]?.status === 'Pending',
    `got ${reports.body?.data?.reports?.[0]?.status}`
  );

  const analytics = await api('/api/admin/analytics', { token: admin.token });
  check('analytics responds 200', analytics.status === 200, `got ${analytics.status}`);
  check(
    'analytics surfaces the cohort topic gap',
    (analytics.body?.data?.learning?.topic_gaps || []).length > 0,
    'no topic gaps computed'
  );

  // --- Admin oversight rosters ---------------------------------------------
  console.log('\nAdmin rosters (spec section 24)');
  const students = await api('/api/admin/students', { token: admin.token });
  check('student roster responds 200', students.status === 200, `got ${students.status}`);
  const jinyuRow = (students.body?.data?.students || []).find((s) => s.email === 'jinyu@student.demo');
  check('roster shows the seeded quiz attempt', jinyuRow?.quiz_attempt_count === 1, `got ${jinyuRow?.quiz_attempt_count}`);
  check('roster shows the latest score', jinyuRow?.latest_quiz_percentage === 70, `got ${jinyuRow?.latest_quiz_percentage}`);
  check(
    'roster never exposes raw quiz answers',
    jinyuRow && jinyuRow.responses === undefined && jinyuRow.answers === undefined
  );

  const tutorRoster = await api('/api/admin/tutors', { token: admin.token });
  check('tutor roster responds 200', tutorRoster.status === 200, `got ${tutorRoster.status}`);
  const alexRow = (tutorRoster.body?.data?.tutors || []).find((t) => t.email === 'alex@tutor.demo');
  check('Alex shows 2 verified modules', alexRow?.verified_module_count === 2, `got ${alexRow?.verified_module_count}`);
  const danielRow = (tutorRoster.body?.data?.tutors || []).find((t) => t.email === 'daniel@tutor.demo');
  check('Daniel shows pending verification requests', danielRow?.pending_verification_count >= 1,
    `got ${danielRow?.pending_verification_count}`);

  const adminSessions = await api('/api/admin/sessions', { token: admin.token });
  check('session records respond 200', adminSessions.status === 200, `got ${adminSessions.status}`);
  check(
    'session records never include chat content',
    (adminSessions.body?.data?.sessions || []).every((s) => !s.messages && !s.chat && !s.chat_messages)
  );
  check(
    'recognition status is never an award',
    (adminSessions.body?.data?.sessions || []).every((s) => !/award|granted/i.test(s.recognition_status || ''))
  );

  // --- Verification workflow (business rule 12) ----------------------------
  // Uses a throwaway Alex/IT2723 request so the seeded Daniel Koh Pending row
  // stays intact for the demo.
  console.log('\nVerification workflow (business rule 12)');
  const it2723 = (modules.body?.data?.modules || []).find((m) => m.module_code === 'IT2723');

  const requested = await api('/api/tutors/me/verifications', {
    method: 'POST',
    token: tutor.token,
    body: { module_id: it2723?.id },
  });
  const newVerificationId = requested.body?.data?.verification?.id;
  check('tutor can request verification', [200, 201, 409].includes(requested.status), `got ${requested.status}`);
  check(
    'a tutor-created request is always Pending, never self-verified',
    requested.status === 409 || requested.body?.data?.verification?.status === 'Pending',
    `got ${requested.body?.data?.verification?.status}`
  );

  if (newVerificationId) {
    const selfApprove = await api(`/api/admin/verifications/${newVerificationId}`, {
      method: 'PATCH',
      token: tutor.token,
      body: { status: 'Verified' },
    });
    check('a tutor cannot approve their own request', selfApprove.status === 403, `got ${selfApprove.status}`);

    const approved = await api(`/api/admin/verifications/${newVerificationId}`, {
      method: 'PATCH',
      token: admin.token,
      body: { status: 'Verified', admin_notes: 'Smoke test approval.' },
    });
    check('admin can approve', approved.status === 200 && approved.body?.data?.verification?.status === 'Verified',
      `got ${approved.status}`);
    check('approval records the deciding admin', approved.body?.data?.verification?.verified_by === admin.user?.id);

    const reApprove = await api(`/api/admin/verifications/${newVerificationId}`, {
      method: 'PATCH',
      token: admin.token,
      body: { status: 'Verified' },
    });
    check('re-approving an already Verified request is refused', reApprove.status === 409, `got ${reApprove.status}`);

    const revoked = await api(`/api/admin/verifications/${newVerificationId}`, {
      method: 'PATCH',
      token: admin.token,
      body: { status: 'Revoked', admin_notes: 'Smoke test cleanup.' },
    });
    check('admin can revoke a verified module', revoked.status === 200 && revoked.body?.data?.verification?.status === 'Revoked',
      `got ${revoked.status}`);

    const notified = await api('/api/notifications', { token: tutor.token });
    check(
      'the tutor was notified of the decision',
      (notified.body?.data?.notifications || []).some((n) => n.type === 'TutorVerified'),
      'no TutorVerified notification found'
    );
  }

  const queue = await api('/api/admin/verifications?status=Pending', { token: admin.token });
  check('verification queue responds 200', queue.status === 200, `got ${queue.status}`);
  check(
    'the seeded Pending demo request is still intact',
    (queue.body?.data?.verifications || []).some((v) => v.tutor?.user?.full_name === 'Daniel Koh'),
    'Daniel Koh no longer has a Pending request'
  );
  check(
    'queue entries are hydrated with tutor and module',
    (queue.body?.data?.verifications || []).every((v) => v.tutor?.user?.full_name && v.module?.module_code)
  );

  // --- Write path: sort-key ordering is the one real SQLite difference ------
  console.log('\nWrite path + ordering');
  const notif = await api('/api/notifications', { token: tutee.token });
  check('notifications endpoint responds 200', notif.status === 200, `got ${notif.status}`);

  const profileUpdate = await api('/api/users/me', {
    method: 'PATCH',
    token: tutee.token,
    body: { share_learning_summary: true },
  });
  check('profile update persists', profileUpdate.status === 200 && profileUpdate.body?.data?.user?.share_learning_summary === true,
    `status ${profileUpdate.status}`);

  const revert = await api('/api/users/me', {
    method: 'PATCH',
    token: tutee.token,
    body: { share_learning_summary: false },
  });
  check('profile update reverts', revert.body?.data?.user?.share_learning_summary === false);

  const escalation = await api('/api/users/me', {
    method: 'PATCH',
    token: tutee.token,
    body: { role: 'Admin' },
  });
  check('role escalation via profile PATCH is ignored', escalation.body?.data?.user?.role === 'Tutee',
    `got ${escalation.body?.data?.user?.role}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nSmoke test could not reach ${BASE}: ${err.message}`);
  console.error('\nCheck that:');
  console.error('  1. the backend is running (`npm run dev` in /backend)');
  console.error(`  2. it is listening on the port this script targets (${BASE})`);
  console.error('     PORT and SMOKE_BASE_URL are read from the environment, and an');
  console.error('     exported shell variable overrides backend/.env — so a stray');
  console.error('     `set PORT=...` in this terminal will point the test at the wrong place.\n');
  process.exit(1);
});
