const serverless = require('serverless-http');
const app = require('./app');

// Wraps the Express app for AWS Lambda (behind API Gateway REST API).
// Local dev uses server.js instead; this file is the deployment entrypoint.
module.exports.handler = serverless(app);
