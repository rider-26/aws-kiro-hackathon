// Small helpers to keep API responses consistent across all routes.

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function created(res, data) {
  return ok(res, data, 201);
}

function fail(res, status, message, details) {
  return res.status(status).json({ success: false, message, details });
}

module.exports = { ok, created, fail };
