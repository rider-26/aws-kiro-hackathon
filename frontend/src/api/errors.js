/**
 * Turns an axios failure into a message worth showing a user.
 *
 * The distinction that matters: an error with no `response` never reached the
 * server (backend down, wrong VITE_API_BASE_URL, DNS, CORS preflight refused).
 * Falling back to a domain message like "Invalid email or password" or
 * "Registration failed" in that case is actively misleading — it sends someone
 * to re-check input that was never even submitted. So a transport failure says
 * so explicitly, and only real API responses use the domain fallback.
 */
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  // The server answered and our error handler always includes a message.
  const serverMessage = err?.response?.data?.message;
  if (serverMessage) return serverMessage;

  if (err?.response) {
    // Answered, but with no usable body — report the status rather than guessing.
    return `The server returned an unexpected error (HTTP ${err.response.status}).`;
  }

  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
    return 'The server took too long to respond. Check that the backend is running, then try again.';
  }

  if (err?.request) {
    return 'Cannot reach the server. Check that the backend is running on the expected address, then try again.';
  }

  return fallback;
}

/** True when the request never got a response at all. */
export function isNetworkError(err) {
  return !!err && !err.response;
}
