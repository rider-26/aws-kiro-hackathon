const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const env = require('./env');

// Credentials are only ever read from environment variables (via dotenv locally,
// or Lambda execution role env vars in deployment). Never hardcode secrets here.
const clientConfig = { region: env.aws.region };

if (env.aws.accessKeyId && env.aws.secretAccessKey) {
  clientConfig.credentials = {
    accessKeyId: env.aws.accessKeyId,
    secretAccessKey: env.aws.secretAccessKey,
    // Temporary credentials (AWS Academy / Learner Lab, STS, assumed roles)
    // are rejected without their session token, so pass it through when set.
    ...(env.aws.sessionToken ? { sessionToken: env.aws.sessionToken } : {}),
  };
}

const client = new DynamoDBClient(clientConfig);

const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
});

module.exports = ddb;
