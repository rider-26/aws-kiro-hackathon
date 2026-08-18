const http = require('http');
const app = require('./app');
const env = require('./config/env');
const localHub = require('./realtime/localHub');

/**
 * Local development entrypoint. Creates an explicit http.Server so the
 * WebSocket hub can share the same port as the REST API. In deployment,
 * lambda.js serves REST and websocket.js serves the API Gateway WebSocket
 * API instead — this file is not used there.
 */
const server = http.createServer(app);
localHub.attach(server);

server.listen(env.port, () => {
  console.log(`PeerLink NYP backend listening on http://localhost:${env.port}`);
  console.log(`WebSocket available at ws://localhost:${env.port}/ws?token=<jwt>`);

  // State the driver on every boot. Without this, a wrong driver only shows up
  // as an HTTP 500 with an AWS credentials error on the first login, which is a
  // confusing way to discover the problem. Worth noting that dotenv does NOT
  // override variables already present in the environment, so an exported
  // DB_DRIVER in your shell silently wins over backend/.env — this line makes
  // that visible immediately.
  // A CORS mismatch is invisible from the server side: the request succeeds and
  // gets logged as a 200, but the browser discards the response and the page
  // reports a network failure. Printing the allowed origins makes that
  // diagnosable in one glance instead of a devtools dig.
  //
  // NODE_ENV is printed alongside because it CHANGES this list — outside
  // production the localhost dev origins are added automatically, so a stray
  // NODE_ENV=production in the shell silently narrows what the browser may use.
  console.log(`Mode: ${env.nodeEnv}`);
  console.log(`CORS allowed origins: ${env.allowedOrigins.join(', ')}`);

  if (env.dbDriver === 'sqlite') {
    console.log(`Storage: sqlite (${env.sqlitePath})`);
  } else {
    const hasCredentials = !!(env.aws.accessKeyId && env.aws.secretAccessKey);
    console.log(`Storage: dynamodb (region ${env.aws.region})`);
    if (!hasCredentials) {
      console.warn(
        'WARNING: DB_DRIVER=dynamodb but no AWS credentials are configured, so every\n' +
        '         request that touches data will fail. Set DB_DRIVER=sqlite in backend/.env\n' +
        '         for local development, and make sure DB_DRIVER is not exported in your shell.'
      );
    }
  }
});
