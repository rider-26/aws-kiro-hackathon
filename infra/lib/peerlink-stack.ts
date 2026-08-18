import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';

/**
 * PeerLink NYP infrastructure.
 *
 * This stack deliberately IMPORTS pre-provisioned DynamoDB tables and the S3
 * bucket rather than creating them — those are provisioned directly by the
 * project owner per the agreed infra spec. CDK only owns the compute/API
 * layer: the REST Lambda (Express app), the WebSocket API (chat +
 * notifications), and the IAM permissions tying them to the existing data
 * resources.
 */

const TABLE_ENV_VARS: Record<string, string> = {
  TABLE_USERS: 'PeerLink_Users',
  TABLE_TUTOR_PROFILES: 'PeerLink_TutorProfiles',
  TABLE_MODULES: 'PeerLink_Modules',
  TABLE_TUTOR_VERIFICATIONS: 'PeerLink_TutorVerifications',
  TABLE_TUTOR_TOPICS: 'PeerLink_TutorTopics',
  TABLE_TUTOR_AVAILABILITY: 'PeerLink_TutorAvailability',
  TABLE_SAVED_TUTORS: 'PeerLink_SavedTutors',
  TABLE_BOOKINGS: 'PeerLink_Bookings',
  TABLE_SESSIONS: 'PeerLink_TutoringSessions',
  TABLE_SESSION_PARTICIPANTS: 'PeerLink_SessionParticipants',
  TABLE_CHAT_MESSAGES: 'PeerLink_ChatMessages',
  TABLE_STUDY_MATERIALS: 'PeerLink_StudyMaterials',
  TABLE_QUIZZES: 'PeerLink_Quizzes',
  TABLE_QUIZ_QUESTIONS: 'PeerLink_QuizQuestions',
  TABLE_QUIZ_ATTEMPTS: 'PeerLink_QuizAttempts',
  TABLE_QUIZ_RESPONSES: 'PeerLink_QuizResponses',
  TABLE_TOPIC_PERFORMANCE: 'PeerLink_TopicPerformance',
  TABLE_REVIEWS: 'PeerLink_Reviews',
  TABLE_USER_REPORTS: 'PeerLink_UserReports',
  TABLE_NOTIFICATIONS: 'PeerLink_Notifications',
  TABLE_RECOGNITION_RULES: 'PeerLink_RecognitionRules',
  TABLE_CONNECTIONS: 'PeerLink_Connections',
};

/**
 * What never belongs in the Lambda bundle.
 *
 * `better-sqlite3` matters most: it's a NATIVE module compiled for the machine
 * that ran `npm install`, so a Windows/macOS build shipped to Amazon Linux
 * would be unloadable. Nothing requires it when DB_DRIVER=dynamodb (the sqlite
 * adapter is only required lazily from baseRepository when that driver is
 * selected), so excluding it is safe — and it keeps the bundle smaller. The
 * local database file and .env are excluded so no local data or secret is ever
 * uploaded.
 */
const LAMBDA_BUNDLE_EXCLUDES = [
  'node_modules/.cache',
  'node_modules/better-sqlite3',
  'node_modules/prebuild-install',
  'node_modules/.bin',
  'tests',
  'scripts',
  'coverage',
  'data',
  '*.log',
  '*.db',
  '*.db-wal',
  '*.db-shm',
  '.env',
  '.env.*',
];

/** Fails the synth rather than deploying a function that can't sign a token. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required to deploy. Set it in infra/.env (see infra/.env.example) before running cdk deploy.`
    );
  }
  return value;
}

export class PeerLinkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const resolvedTableNames: Record<string, string> = {};
    for (const [envKey, defaultName] of Object.entries(TABLE_ENV_VARS)) {
      resolvedTableNames[envKey] = process.env[envKey] || defaultName;
    }

    const bucketName = process.env.S3_BUCKET || 'peerlink-nyp-uploads';
    const bucket = s3.Bucket.fromBucketName(this, 'UploadsBucket', bucketName);

    const tables = Object.entries(resolvedTableNames).map(([envKey, tableName]) => ({
      envKey,
      table: dynamodb.Table.fromTableName(this, `Table-${envKey}`, tableName),
    }));

    // --- REST Lambda (Express app via serverless-http) ---
    const apiFn = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      // Path is relative to the bundle root, and the bundle root is /backend —
      // so this must include the src/ prefix. 'lambda.handler' would fail at
      // cold start with "Cannot find module 'lambda'".
      handler: 'src/lambda.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend'), {
        exclude: LAMBDA_BUNDLE_EXCLUDES,
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(20),
      environment: {
        NODE_ENV: 'production',
        // Explicit rather than relying on the default: the backend also ships a
        // SQLite driver for local development, and this is what guarantees the
        // deployed function talks to DynamoDB.
        DB_DRIVER: 'dynamodb',
        JWT_SECRET: requireEnv('JWT_SECRET'),
        JWT_EXPIRES_IN: '7d',
        S3_BUCKET: bucketName,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
        DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
        DEEPSEEK_MODEL: 'deepseek-chat',
        FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || '*',
        ...resolvedTableNames,
      },
    });

    for (const { table } of tables) {
      table.grantReadWriteData(apiFn);
    }
    bucket.grantReadWrite(apiFn);

    // Scope CORS to the deployed frontend when FRONTEND_ORIGIN is set. Falling
    // back to ALL_ORIGINS keeps a first deploy working before the Amplify or
    // Netlify URL is known, but it should be narrowed once it is — every
    // endpoint behind this API is authenticated by the Express middleware, so
    // this is defence in depth rather than the primary control.
    const frontendOrigin = process.env.FRONTEND_ORIGIN;
    const restApi = new apigw.LambdaRestApi(this, 'RestApi', {
      handler: apiFn,
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: frontendOrigin ? [frontendOrigin] : apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: { stageName: 'api' },
    });

    if (!frontendOrigin) {
      cdk.Annotations.of(this).addWarning(
        'FRONTEND_ORIGIN is not set, so the REST API accepts CORS requests from any origin. ' +
        'Set it in infra/.env to your Amplify/Netlify URL and redeploy.'
      );
    }

    // --- WebSocket API (session chat + real-time notifications) ---
    const connectionsTable = dynamodb.Table.fromTableName(
      this,
      'ConnectionsTable',
      resolvedTableNames.TABLE_CONNECTIONS
    );

    const wsHandler = new lambda.Function(this, 'WebSocketFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'src/websocket.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend'), {
        exclude: LAMBDA_BUNDLE_EXCLUDES,
      }),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        NODE_ENV: 'production',
        DB_DRIVER: 'dynamodb',
        // The $connect handler verifies the JWT before registering a socket, so
        // it needs the same signing secret as the REST function.
        JWT_SECRET: requireEnv('JWT_SECRET'),
        TABLE_CONNECTIONS: resolvedTableNames.TABLE_CONNECTIONS,
        TABLE_CHAT_MESSAGES: resolvedTableNames.TABLE_CHAT_MESSAGES,
        TABLE_NOTIFICATIONS: resolvedTableNames.TABLE_NOTIFICATIONS,
      },
    });
    connectionsTable.grantReadWriteData(wsHandler);

    const webSocketApi = new apigwv2.WebSocketApi(this, 'WebSocketApi', {
      connectRouteOptions: { integration: new apigwv2Integrations.WebSocketLambdaIntegration('ConnectIntegration', wsHandler) },
      disconnectRouteOptions: { integration: new apigwv2Integrations.WebSocketLambdaIntegration('DisconnectIntegration', wsHandler) },
      defaultRouteOptions: { integration: new apigwv2Integrations.WebSocketLambdaIntegration('DefaultIntegration', wsHandler) },
    });

    const wsStage = new apigwv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    // Allow the WS handler (and the REST API Lambda, for pushing chat/notifications) to
    // manage connections (post to connection) on the deployed WebSocket API.
    const manageConnectionsPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${wsStage.stageName}/POST/@connections/*`,
      ],
    });
    wsHandler.addToRolePolicy(manageConnectionsPolicy);
    apiFn.addToRolePolicy(manageConnectionsPolicy);
    apiFn.addEnvironment('WEBSOCKET_API_ENDPOINT', wsStage.callbackUrl);

    new cdk.CfnOutput(this, 'RestApiUrl', { value: restApi.url });
    new cdk.CfnOutput(this, 'WebSocketUrl', { value: wsStage.url });
  }
}
