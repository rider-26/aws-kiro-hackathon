const idGen = require('../utils/idGen');
const userReportRepository = require('../repositories/userReportRepository');
const userRepository = require('../repositories/userRepository');
const sessionRepository = require('../repositories/sessionRepository');
const moduleRepository = require('../repositories/moduleRepository');
const notificationService = require('./notificationService');
const { sanitizeUser } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

/**
 * User reporting and admin moderation (spec sections 25 and 26).
 *
 * Two deliberate boundaries in this file:
 *
 * 1. Reporters can CREATE and READ their own reports, and nothing else. They
 *    cannot see the admin's notes, cannot see another user's reports, and
 *    cannot change a report's status once filed — moderation outcomes are
 *    the admin's record, not the reporter's.
 *
 * 2. Only `applyAdminAction` moves a report out of Pending, and only that
 *    function can suspend an account. Suspension writes
 *    `account_status: 'Suspended'`, which authService's login path already
 *    refuses, so the moderation decision takes effect on the next login
 *    attempt with no extra wiring.
 */

// Spec section 25: the nine report categories offered in the report form.
const REPORT_CATEGORIES = [
  'No Show',
  'Late Cancellation',
  'Inappropriate Behaviour',
  'Harassment or Bullying',
  'Academic Integrity Concern',
  'Misrepresented Expertise',
  'Requesting Payment',
  'Spam or Scam',
  'Other',
];

// Spec section 26: the four lifecycle states an admin moves a report through.
const REPORT_STATUSES = ['Pending', 'Under Review', 'Resolved', 'Dismissed'];

/**
 * The five moderation actions available in the admin queue. Each entry maps
 * an action to the status it lands the report in and the outcome recorded on
 * the report, so the queue UI and the audit trail can never disagree.
 */
const ADMIN_ACTIONS = {
  warn: {
    label: 'Issue Warning',
    status: 'Resolved',
    action_taken: 'Warning Issued',
    notifies_reported_user: true,
  },
  suspend: {
    label: 'Suspend Account',
    status: 'Resolved',
    action_taken: 'Account Suspended',
    notifies_reported_user: true,
    suspends_account: true,
  },
  request_info: {
    label: 'Request More Info',
    status: 'Under Review',
    action_taken: 'More Information Requested',
    notifies_reporter: true,
  },
  dismiss: {
    label: 'Dismiss Report',
    status: 'Dismissed',
    action_taken: 'Dismissed — No Breach Found',
    notifies_reporter: true,
  },
  resolve: {
    label: 'Mark Resolved',
    status: 'Resolved',
    action_taken: 'Resolved — No Further Action',
    notifies_reporter: true,
  },
};

const MAX_DESCRIPTION = 2000;

/**
 * Files a report. Available to both Tutees and Tutors (spec section 25 —
 * either party in a session can report the other).
 */
async function createReport(reporter, { reported_user_id, session_id, category, description }) {
  if (!reported_user_id) throw new ApiError(400, 'reported_user_id is required');

  if (reported_user_id === reporter.id) {
    throw new ApiError(400, 'You cannot report your own account');
  }

  if (!REPORT_CATEGORIES.includes(category)) {
    throw new ApiError(400, `category must be one of: ${REPORT_CATEGORIES.join(', ')}`);
  }

  const trimmed = (description || '').trim();
  if (!trimmed) throw new ApiError(400, 'description is required');
  if (trimmed.length > MAX_DESCRIPTION) {
    throw new ApiError(400, `description must be ${MAX_DESCRIPTION} characters or fewer`);
  }

  const reported = await userRepository.getById(reported_user_id);
  if (!reported) throw new ApiError(404, 'The user you are reporting was not found');

  // Admins are the moderators; routing a report at one would have nobody to
  // action it and gives a path to disrupt the moderation queue itself.
  if (reported.role === 'Admin') {
    throw new ApiError(400, 'Administrator accounts cannot be reported through this form');
  }

  // A session reference is optional (someone may report conduct in chat before
  // a session exists), but if supplied it must be real.
  if (session_id) {
    const session = await sessionRepository.getById(session_id);
    if (!session) throw new ApiError(404, 'Session not found');
  }

  const report = await userReportRepository.create({
    id: idGen('report'),
    reporter_id: reporter.id,
    reporter_role: reporter.role,
    reported_user_id,
    session_id: session_id || null,
    category,
    description: trimmed,
    status: 'Pending',
    action_taken: null,
    admin_notes: null,
    reviewed_by: null,
    reviewed_date: null,
    created_date: new Date().toISOString(),
  });

  return report;
}

/**
 * Hydrates a report for display. `includeAdminFields` is false for the
 * reporter's own list so admin notes stay internal.
 */
async function hydrateReport(report, { includeAdminFields = false } = {}) {
  const [reporter, reported] = await Promise.all([
    userRepository.getById(report.reporter_id),
    userRepository.getById(report.reported_user_id),
  ]);

  let session = null;
  let module = null;
  if (report.session_id) {
    session = await sessionRepository.getById(report.session_id);
    if (session && session.module_id) {
      module = await moduleRepository.getById(session.module_id);
    }
  }

  const base = {
    id: report.id,
    category: report.category,
    description: report.description,
    status: report.status,
    action_taken: report.action_taken,
    created_date: report.created_date,
    reviewed_date: report.reviewed_date,
    session_id: report.session_id,
    reported_user: sanitizeUser(reported),
    session: session
      ? {
          id: session.id,
          session_date: session.session_date,
          start_time: session.start_time,
          end_time: session.end_time,
          status: session.status,
          module: module ? { id: module.id, module_code: module.module_code, module_name: module.module_name } : null,
        }
      : null,
  };

  if (!includeAdminFields) return base;

  return {
    ...base,
    reporter: sanitizeUser(reporter),
    reporter_role: report.reporter_role,
    reported_user_status: reported ? reported.account_status || 'Active' : null,
    admin_notes: report.admin_notes,
    reviewed_by: report.reviewed_by,
  };
}

/** The reporter's own filed reports, newest first. */
async function listOwnReports(userId) {
  const reports = await userReportRepository.listByReporter(userId);
  const sorted = reports.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
  return Promise.all(sorted.map((r) => hydrateReport(r)));
}

/**
 * The admin moderation queue. Pending first, then Under Review, then closed
 * reports — so the items needing a decision are always at the top regardless
 * of when they were filed.
 */
const QUEUE_ORDER = { Pending: 0, 'Under Review': 1, Resolved: 2, Dismissed: 3 };

async function listForAdmin({ status } = {}) {
  const all = await userReportRepository.listAll();

  const filtered = status ? all.filter((r) => r.status === status) : all;

  const sorted = filtered.sort((a, b) => {
    const rank = (QUEUE_ORDER[a.status] ?? 9) - (QUEUE_ORDER[b.status] ?? 9);
    if (rank !== 0) return rank;
    return (b.created_date || '').localeCompare(a.created_date || '');
  });

  const reports = await Promise.all(sorted.map((r) => hydrateReport(r, { includeAdminFields: true })));

  return {
    reports,
    counts: {
      total: all.length,
      pending: all.filter((r) => r.status === 'Pending').length,
      under_review: all.filter((r) => r.status === 'Under Review').length,
      resolved: all.filter((r) => r.status === 'Resolved').length,
      dismissed: all.filter((r) => r.status === 'Dismissed').length,
    },
  };
}

async function getForAdmin(reportId) {
  const report = await userReportRepository.getById(reportId);
  if (!report) throw new ApiError(404, 'Report not found');

  // Prior reports against the same user give the admin the context to tell a
  // one-off complaint from a pattern before choosing an action.
  const history = await userReportRepository.listByReportedUser(report.reported_user_id);
  const priors = history
    .filter((r) => r.id !== report.id)
    .sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''))
    .map((r) => ({
      id: r.id,
      category: r.category,
      status: r.status,
      action_taken: r.action_taken,
      created_date: r.created_date,
    }));

  const hydrated = await hydrateReport(report, { includeAdminFields: true });
  return { ...hydrated, prior_reports: priors, prior_report_count: priors.length };
}

/**
 * Applies a moderation decision. This is the ONLY function that changes a
 * report's status, and the only place in the app that suspends an account.
 */
async function applyAdminAction(adminId, reportId, { action, admin_notes }) {
  const config = ADMIN_ACTIONS[action];
  if (!config) {
    throw new ApiError(400, `action must be one of: ${Object.keys(ADMIN_ACTIONS).join(', ')}`);
  }

  const report = await userReportRepository.getById(reportId);
  if (!report) throw new ApiError(404, 'Report not found');

  // Closed reports are a record of a decision already made. Reopening would
  // let an outcome be rewritten after the fact, so it is refused.
  if (report.status === 'Resolved' || report.status === 'Dismissed') {
    throw new ApiError(409, `This report is already ${report.status} and cannot be actioned again`);
  }

  const notes = (admin_notes || '').trim();
  if (notes.length > MAX_DESCRIPTION) {
    throw new ApiError(400, `admin_notes must be ${MAX_DESCRIPTION} characters or fewer`);
  }

  let suspended_user = null;
  if (config.suspends_account) {
    const reported = await userRepository.getById(report.reported_user_id);
    if (!reported) throw new ApiError(404, 'The reported user no longer exists');
    if (reported.role === 'Admin') {
      throw new ApiError(400, 'Administrator accounts cannot be suspended through moderation');
    }
    // authService.login already refuses account_status === 'Suspended', so
    // this single write is what locks the account out.
    suspended_user = await userRepository.update(reported.id, {
      account_status: 'Suspended',
      suspended_date: new Date().toISOString(),
      suspended_reason: `Moderation action on report ${report.id}`,
    });
  }

  const updated = await userReportRepository.update(reportId, {
    status: config.status,
    action_taken: config.action_taken,
    admin_notes: notes || report.admin_notes || null,
    reviewed_by: adminId,
    reviewed_date: new Date().toISOString(),
  });

  // Notifications are best-effort: a delivery failure must not roll back a
  // moderation decision that is already persisted.
  try {
    if (config.notifies_reported_user) {
      await notificationService.notify(report.reported_user_id, {
        type: 'ReportUpdated',
        title: config.suspends_account ? 'Your account has been suspended' : 'Community guidelines warning',
        message: config.suspends_account
          ? 'An administrator has suspended your PeerLink account following a report. Contact your lecturer or an administrator to appeal.'
          : 'An administrator has issued a warning on your account following a report about your conduct in a session.',
        link: '/notifications',
      });
    }

    if (config.notifies_reporter) {
      await notificationService.notify(report.reporter_id, {
        type: 'ReportUpdated',
        title: `Report ${config.status.toLowerCase()}`,
        message:
          action === 'request_info'
            ? 'An administrator needs more information about the report you filed. Please check your report and reply.'
            : `Your report has been reviewed. Outcome: ${config.action_taken}.`,
        link: '/reports',
      });
    }
  } catch (err) {
    console.warn('[reports] notification failed after moderation action:', err.message);
  }

  return {
    report: await hydrateReport(updated, { includeAdminFields: true }),
    suspended_user: suspended_user ? sanitizeUser(suspended_user) : null,
  };
}

/**
 * Lifts a suspension. Kept alongside the moderation actions so both halves of
 * the decision live in one place, and exposed only on admin routes.
 */
async function reinstateUser(adminId, userId) {
  const user = await userRepository.getById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  if ((user.account_status || 'Active') !== 'Suspended') {
    throw new ApiError(409, 'This account is not suspended');
  }

  const updated = await userRepository.update(userId, {
    account_status: 'Active',
    suspended_date: null,
    suspended_reason: null,
    reinstated_by: adminId,
    reinstated_date: new Date().toISOString(),
  });

  try {
    await notificationService.notify(userId, {
      type: 'ReportUpdated',
      title: 'Your account has been reinstated',
      message: 'An administrator has lifted the suspension on your PeerLink account. You can sign in again.',
      link: '/notifications',
    });
  } catch (err) {
    console.warn('[reports] reinstatement notification failed:', err.message);
  }

  return sanitizeUser(updated);
}

module.exports = {
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  ADMIN_ACTIONS,
  createReport,
  listOwnReports,
  listForAdmin,
  getForAdmin,
  applyAdminAction,
  reinstateUser,
};
