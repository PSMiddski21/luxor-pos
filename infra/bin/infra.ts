#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { LuxorStack } from '../lib/luxor-stack';

const app = new cdk.App();

// Falls back to the real account (not just a placeholder) so `cdk synth`
// resolves to the same env the committed infra/cdk.context.json was cached
// against — needed for the HostedZone.fromLookup calls below to work in CI,
// which has no AWS credentials to do a live lookup with.
const account = process.env.CDK_DEFAULT_ACCOUNT ?? '838277667886';
const region = process.env.CDK_DEFAULT_REGION ?? 'eu-west-2';
const rootDomainName = 'jmluxor.app';
const siteDomainName = 'pos.jmluxor.app';

// CloudFront only accepts ACM certificates issued in us-east-1, regardless
// of which region the rest of the stack lives in — so the certificate gets
// its own stack there, wired into LuxorStack via an explicit cross-region
// reference. (The alternative, DnsValidatedCertificate, does this with a
// Lambda-backed custom resource in a single stack, but that resource
// unconditionally needs live AWS credentials at synth time — breaks in CI.
// A plain acm.Certificate + DNS validation is a native CloudFormation
// resource, so it doesn't have that problem.)
const certStack = new cdk.Stack(app, 'LuxorCertStack', {
  env: { account, region: 'us-east-1' },
  crossRegionReferences: true,
});
const certHostedZone = route53.HostedZone.fromLookup(certStack, 'HostedZone', {
  domainName: rootDomainName,
});
const siteCertificate = new acm.Certificate(certStack, 'SiteCertificate', {
  domainName: siteDomainName,
  validation: acm.CertificateValidation.fromDns(certHostedZone),
});

new LuxorStack(app, 'LuxorStack', {
  env: { account, region },
  crossRegionReferences: true,
  rootDomainName,
  siteDomainName,
  siteCertificate,
});
