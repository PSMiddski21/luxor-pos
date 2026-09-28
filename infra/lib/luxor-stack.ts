import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigwAuthorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export interface LuxorStackProps extends cdk.StackProps {
  /** Route 53 zone the site's custom domain lives in, e.g. "jmluxor.app". */
  rootDomainName: string;
  /** Full custom domain for the site, e.g. "pos.jmluxor.app". */
  siteDomainName: string;
  /** us-east-1 ACM certificate for siteDomainName — see bin/infra.ts. */
  siteCertificate: acm.ICertificate;
}

/**
 * Serverless stack for the Luxor salon system.
 *
 * No VPC: Aurora Serverless v2 is accessed via the RDS Data API (HTTPS),
 * so the API Lambda needs no ENI/NAT — keeps cost and cold starts down for
 * a single small-business site with low, spiky traffic.
 */
export class LuxorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LuxorStackProps) {
    super(scope, id, props);

    const databaseName = 'luxor';

    // -----------------------------------------------------------------
    // Database — Aurora Serverless v2 Postgres, Data API enabled
    // -----------------------------------------------------------------
    // A VPC is still required to place the cluster in, even though the
    // Lambda talks to it over the Data API rather than a direct DB
    // connection — this VPC has no NAT gateways, so it costs nothing extra.
    const vpc = new ec2.Vpc(this, 'DbVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    const dbCluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        // 16.4 was retired from creatable versions in eu-west-2; 16.13 is
        // the newest 16.x this aws-cdk-lib version has a constant for that
        // AWS still offers here (checked via `aws rds
        // describe-db-engine-versions --engine aurora-postgresql`).
        version: rds.AuroraPostgresEngineVersion.VER_16_13,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      defaultDatabaseName: databaseName,
      enableDataApi: true,
      serverlessV2MinCapacity: 0.5, // lowest available capacity; ~$43/mo baseline
      serverlessV2MaxCapacity: 2,
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      credentials: rds.Credentials.fromGeneratedSecret('luxor_admin'),
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      storageEncrypted: true,
    });

    // -----------------------------------------------------------------
    // Auth — Cognito User Pool. One shared "till" login gates the app;
    // individual staff still clock in/out by picking their name, same as
    // a real shared iPad at the front desk.
    // -----------------------------------------------------------------
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'luxor-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: { userSrp: true, userPassword: true },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(8),
      idTokenValidity: cdk.Duration.hours(8),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Membership in this group is what the frontend reads (as the ID
    // token's cognito:groups claim) to show the full admin UI — Stock,
    // Rota, and Reports — instead of the till-only view. Anyone not in it
    // gets the till view; there's no separate "till" group to manage.
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: 'Full access, including Stock, Rota, and Reports',
    });

    // -----------------------------------------------------------------
    // API Lambda — Hono app, talks to Aurora via the Data API
    // -----------------------------------------------------------------
    const apiLambda = new lambdaNode.NodejsFunction(this, 'ApiFunction', {
      entry: path.join(__dirname, '..', 'lambda', 'app.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      architecture: lambda.Architecture.ARM_64,
      logGroup: new logs.LogGroup(this, 'ApiFunctionLogs', {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        CLUSTER_ARN: dbCluster.clusterArn,
        SECRET_ARN: dbCluster.secret!.secretArn,
        DATABASE_NAME: databaseName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    dbCluster.grantDataApiAccess(apiLambda);

    // -----------------------------------------------------------------
    // HTTP API — Cognito-authorized, proxies everything to the Lambda
    // -----------------------------------------------------------------
    const authorizer = new apigwAuthorizers.HttpUserPoolAuthorizer('CognitoAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
    });

    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowOrigins: ['*'], // tighten to the CloudFront domain after first deploy
      },
      defaultAuthorizer: authorizer,
    });

    // Explicit methods rather than ANY — ANY matches OPTIONS too, which
    // would shadow API Gateway's automatic CORS preflight handling with
    // this route's Cognito authorizer and make every preflight 401.
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST, apigw.HttpMethod.PATCH, apigw.HttpMethod.DELETE],
      integration: new apigwIntegrations.HttpLambdaIntegration('ApiIntegration', apiLambda),
    });

    // -----------------------------------------------------------------
    // Frontend — S3 + CloudFront (SPA routing via error responses)
    // -----------------------------------------------------------------
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Custom domain — jmluxor.app's zone already exists in Route 53
    // (registered there). The certificate itself lives in a separate
    // us-east-1 stack (see bin/infra.ts) since CloudFront only accepts ACM
    // certs from that region; it's passed in via props.
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.rootDomainName,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      domainNames: [props.siteDomainName],
      certificate: props.siteCertificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    const cloudFrontAliasTarget = route53.RecordTarget.fromAlias(
      new route53Targets.CloudFrontTarget(distribution),
    );
    new route53.ARecord(this, 'SiteAliasRecord', {
      zone: hostedZone,
      recordName: props.siteDomainName,
      target: cloudFrontAliasTarget,
    });
    new route53.AaaaRecord(this, 'SiteAliasRecordIPv6', {
      zone: hostedZone,
      recordName: props.siteDomainName,
      target: cloudFrontAliasTarget,
    });

    // Deploy the Vite build output. Run `npm run build` in the project root
    // before `cdk deploy` so ../dist exists. config.json is excluded from
    // this source — Vite copies public/config.json (a local dev placeholder)
    // into dist/ verbatim, and DeployConfig below is its real source of
    // truth. prune is off too: DeployConfig only re-runs when its generated
    // content actually changes, so if this deployment pruned on every run,
    // it would delete config.json on any deploy where DeployConfig itself
    // had nothing new to write.
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', 'dist'), { exclude: ['config.json'] })],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
    });

    // Runtime config the frontend fetches at startup — values are only
    // known after this stack deploys, so they can't be Vite build-time env
    // vars. Deployed with no-cache so a redeploy is picked up immediately.
    new s3deploy.BucketDeployment(this, 'DeployConfig', {
      sources: [
        s3deploy.Source.jsonData('config.json', {
          apiUrl: httpApi.apiEndpoint,
          userPoolId: userPool.userPoolId,
          userPoolClientId: userPoolClient.userPoolClientId,
          awsRegion: this.region,
        }),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/config.json'],
      cacheControl: [s3deploy.CacheControl.noCache()],
      prune: false,
    });

    // -----------------------------------------------------------------
    // Outputs
    // -----------------------------------------------------------------
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${props.siteDomainName}` });
    new cdk.CfnOutput(this, 'CloudFrontDomainName', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'DbClusterArn', { value: dbCluster.clusterArn });
    new cdk.CfnOutput(this, 'DbSecretArn', { value: dbCluster.secret!.secretArn });
    new cdk.CfnOutput(this, 'DbName', { value: databaseName });
  }
}
