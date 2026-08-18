#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { PeerLinkStack } from '../lib/peerlink-stack';

const app = new cdk.App();

new PeerLinkStack(app, 'PeerLinkNypStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-1',
  },
  description: 'PeerLink NYP - Lambda API (REST + WebSocket) over pre-provisioned DynamoDB/S3 resources',
});
