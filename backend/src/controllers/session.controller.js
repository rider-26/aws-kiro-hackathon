const sessionService = require('../services/sessionService');
const chatService = require('../services/chatService');
const attendanceService = require('../services/attendanceService');
const groupSessionService = require('../services/groupSessionService');
const { ok, created } = require('../utils/response');

async function listMySessions(req, res, next) {
  try {
    const sessions = await sessionService.listSessionsForUser(req.user);
    return ok(res, { sessions });
  } catch (err) {
    return next(err);
  }
}

async function getSession(req, res, next) {
  try {
    const session = await sessionService.getSessionForUser(req.params.id, req.user);
    return ok(res, { session });
  } catch (err) {
    return next(err);
  }
}

async function listMessages(req, res, next) {
  try {
    const messages = await chatService.listMessages(req.params.id, req.user);
    return ok(res, { messages });
  } catch (err) {
    return next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const message = await chatService.sendMessage(req.params.id, req.user, req.body);
    return created(res, { message });
  } catch (err) {
    return next(err);
  }
}

async function getAttendance(req, res, next) {
  try {
    const attendance = await attendanceService.getAttendance(req.params.id, req.user);
    return ok(res, attendance);
  } catch (err) {
    return next(err);
  }
}

async function startSession(req, res, next) {
  try {
    const session = await attendanceService.startSession(req.params.id, req.user);
    return ok(res, { session });
  } catch (err) {
    return next(err);
  }
}

async function endSession(req, res, next) {
  try {
    const session = await attendanceService.endSession(req.params.id, req.user);
    return ok(res, { session });
  } catch (err) {
    return next(err);
  }
}

async function checkIn(req, res, next) {
  try {
    const participant = await attendanceService.checkIn(req.params.id, req.user, req.body);
    return ok(res, { participant });
  } catch (err) {
    return next(err);
  }
}

async function confirmCompletion(req, res, next) {
  try {
    const participant = await attendanceService.confirmCompletion(req.params.id, req.user);
    return ok(res, { participant });
  } catch (err) {
    return next(err);
  }
}

async function listGroupSessions(req, res, next) {
  try {
    const sessions = req.user.role === 'Tutor'
      ? await groupSessionService.listOwnGroupSessions(req.user.id)
      : await groupSessionService.listGroupSessions(req.user.id, {
          includePast: req.query.includePast === 'true',
          moduleId: req.query.moduleId,
        });
    return ok(res, { sessions });
  } catch (err) {
    return next(err);
  }
}

async function createGroupSession(req, res, next) {
  try {
    const session = await groupSessionService.createGroupSession(req.user.id, req.body);
    return created(res, { session });
  } catch (err) {
    return next(err);
  }
}

async function joinGroupSession(req, res, next) {
  try {
    const result = await groupSessionService.joinGroupSession(req.params.id, req.user.id);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

async function leaveGroupSession(req, res, next) {
  try {
    const result = await groupSessionService.leaveGroupSession(req.params.id, req.user.id);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listMySessions,
  getSession,
  listMessages,
  sendMessage,
  getAttendance,
  startSession,
  endSession,
  checkIn,
  confirmCompletion,
  listGroupSessions,
  createGroupSession,
  joinGroupSession,
  leaveGroupSession,
};
