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

/**
 * Serverless stack for the Luxor salon system.
 *
 * No VPC: Aurora Serverless v2 is accessed via the RDS Data API (HTTPS),
 * so the API Lambda needs no ENI/NAT — keeps cost and cold starts down for
 * a single small-business site with low, spiky traffic.
 */
export class LuxorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
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

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
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

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
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

    // Deploy the Vite build output. Run `npm run build` in the project root
    // before `cdk deploy` so ../dist exists.
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', 'dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
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
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'DbClusterArn', { value: dbCluster.clusterArn });
    new cdk.CfnOutput(this, 'DbSecretArn', { value: dbCluster.secret!.secretArn });
    new cdk.CfnOutput(this, 'DbName', { value: databaseName });
  }
}
