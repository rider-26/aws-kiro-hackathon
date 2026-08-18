/* eslint-disable no-console */
const idGen = require('../utils/idGen');
const userReportRepository = require('../repositories/userReportRepository');

/**
 * Seeds the admin moderation queue so it isn't empty on a fresh database.
 *
 * Deliberately seeds one report in each of three states — Pending, Under
 * Review and Resolved — so the queue demonstrates its ordering and status
 * filters, and one open Pending report is always available to action live.
 *
 * The seeded Resolved report records a warning, NOT a suspension: no demo
 * account is left locked out of login, since `account_status: 'Suspended'`
 * would block that user from signing in.
 */

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function seedReports(users) {
  const jinyu = users['jinyu@student.demo'];
  const farhan = users['farhan@student.demo'];
  const daniel = users['daniel@tutor.demo'];
  const marcus = users['marcus@tutor.demo'];

  if (!jinyu || !daniel) {
    console.log('  skipped: demo users not found');
    return [];
  }

  // Idempotency: if this student already filed anything, assume seeded.
  const existing = await userReportRepository.listByReporter(jinyu.id);
  if (existing.length > 0) {
    console.log('  skipped: reports already present');
    return [];
  }

  const rows = [
    {
      id: idGen('report'),
      reporter_id: jinyu.id,
      reporter_role: 'Tutee',
      reported_user_id: daniel.id,
      session_id: null,
      category: 'No Show',
      description:
        'We agreed on a Wednesday 3pm online session for IT2723. I waited in the session chat for 25 minutes and the tutor never joined or messaged.',
      status: 'Pending',
      action_taken: null,
      admin_notes: null,
      reviewed_by: null,
      reviewed_date: null,
      created_date: daysAgo(2),
    },
  ];

  if (farhan && marcus) {
    rows.push({
      id: idGen('report'),
      reporter_id: farhan.id,
      reporter_role: 'Tutee',
      reported_user_id: marcus.id,
      session_id: null,
      category: 'Academic Integrity Concern',
      description:
        'During the IT2513 session the tutor offered to send me completed answers for the graded lab instead of explaining the method.',
      status: 'Under Review',
      action_taken: 'More Information Requested',
      admin_notes: 'Asked the student for the chat transcript and the exact lab reference.',
      reviewed_by: null,
      reviewed_date: daysAgo(1),
      created_date: daysAgo(4),
    });
  }

  if (marcus) {
    rows.push({
      id: idGen('report'),
      reporter_id: marcus.id,
      reporter_role: 'Tutor',
      reported_user_id: jinyu.id,
      session_id: null,
      category: 'Late Cancellation',
      description:
        'The student cancelled twice within ten minutes of the session start time, after I had already prepared material.',
      status: 'Resolved',
      action_taken: 'Warning Issued',
      admin_notes: 'Spoke to the student. First instance, warning issued. No further action.',
      reviewed_by: null,
      reviewed_date: daysAgo(5),
      created_date: daysAgo(9),
    });
  }

  for (const row of rows) {
    await userReportRepository.create(row);
    console.log(`  report: ${row.category} (${row.status})`);
  }

  return rows;
}

module.exports = { seedReports };
