const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');

/**
 * CORS regression tests.
 *
 * These exist because a CORS misconfiguration is invisible to every other test
 * in this suite: supertest and the smoke scripts send no Origin header, so the
 * server happily returns 200 while a real browser discards the response and the
 * page reports a network failure. The only symptom is client-side, which makes
 * it exactly the kind of break that reaches a demo unnoticed.
 */
describe('CORS configuration', () => {
  it('includes the Vite dev server origin outside production', () => {
    expect(env.allowedOrigins).toContain('http://localhost:5173');
  });

  it('also allows the loopback spelling, which some browsers use', () => {
    expect(env.allowedOrigins).toContain('http://127.0.0.1:5173');
  });

  it('echoes an allowed origin back on a real request', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('answers the preflight a JSON POST triggers', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');

    expect(res.status).toBeLessThan(400);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
  });

  it('does NOT echo an origin that was never configured', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');

    // The request itself still succeeds — CORS is enforced by the browser, which
    // will refuse to hand the response to the page without a matching header.
    // What matters is that the header does not name the attacker's origin.
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });

  it('serves requests that carry no Origin at all', async () => {
    // curl, the smoke scripts and server-to-server calls have no Origin. CORS
    // must not block them; every route is separately authenticated.
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('parses FRONTEND_ORIGIN as a comma-separated list', () => {
    // Proven directly against the resolver rather than the cached singleton, so
    // the test does not depend on this process's environment.
    jest.resetModules();
    const previous = process.env.FRONTEND_ORIGIN;
    process.env.FRONTEND_ORIGIN = 'https://a.example.com, https://b.example.com';

    // eslint-disable-next-line global-require
    const reloaded = require('../src/config/env');
    expect(reloaded.allowedOrigins).toContain('https://a.example.com');
    expect(reloaded.allowedOrigins).toContain('https://b.example.com');

    process.env.FRONTEND_ORIGIN = previous;
    jest.resetModules();
  });
});
