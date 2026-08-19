const { S3Client } = require('@aws-sdk/client-s3');
const env = require('./env');

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

const s3 = new S3Client(clientConfig);

module.exports = s3;
