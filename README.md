# Luxor

A production-track replacement for the tanning salon's Google Sheets
workbook: POS, Stock, Rota, and Timesheets in one app, backed by a real
serverless AWS stack.

## Architecture

```
Browser  →  CloudFront + S3 (static React app)
         →  API Gateway (HTTP API, Cognito-authorized)
         →  Lambda (Hono app)
         →  Aurora Serverless v2 Postgres, via the RDS Data API
```

No VPC networking for the Lambda: it talks to Aurora over the Data API
(HTTPS), which keeps cold starts and cost down for a single small business
site with low, spiky traffic. See [infra/lib/luxor-stack.ts](infra/lib/luxor-stack.ts)
for the full CDK stack.

- **[db/schema.sql](db/schema.sql)** — the Postgres schema. Replaces
  `Dailylog*`, `Customer log`, `Stock`, `Prices`, `Product`, `Rota`,
  `Hours*`, `Timesheets` with a proper relational model. `sell_product()`
  and `use_minutes()` keep a customer's prepaid minute balance and retail
  stock levels correct atomically — the biggest risk in the original sheet
  was a free-text "80 mins left" comment that any typo could corrupt.
- **[db/seed.sql](db/seed.sql)** — sample data for a fresh environment.
- **[infra/](infra)** — AWS CDK (TypeScript) app defining every resource:
  Cognito, Aurora Serverless v2, the API Lambda, HTTP API, S3 + CloudFront.
- **[infra/lambda/](infra/lambda)** — the API itself: a [Hono](https://hono.dev)
  app with one route file per resource, talking to Postgres through
  [infra/lambda/db.ts](infra/lambda/db.ts) (a thin RDS Data API wrapper).
- **`src/`** — the React app. [src/lib/store.ts](src/lib/store.ts) is a
  Zustand store whose actions call the API
  ([src/lib/api.ts](src/lib/api.ts)); the cart itself stays client-only
  until checkout. [src/lib/auth.tsx](src/lib/auth.tsx) wraps Cognito auth
  (via `aws-amplify`) — one shared "till" login gates the whole app, and
  staff still clock in/out by picking their name, same as a real shared
  iPad at the front desk.

## Pages

- **POS** — select a bed → select/search a customer → see their real
  prepaid balance. "Use N min" logs a session against an existing balance
  with no payment. Adding items to the cart and taking a split cash/card
  payment calls `POST /transactions`, which prices every line from the DB
  (never trusts client-submitted totals) and applies `sell_product()` for
  each line inside one Data API transaction.
- **Stock** — every stock-tracked product with supplier, on-hand count, an
  editable reorder level, +/- adjust, and a "set exact count" field for a
  physical stock take.
- **Rota** — a Mon–Sun grid of shifts per staff member.
- **Timesheets** — one-tap clock in/out, computed hours worked and
  estimated pay per entry.
- **Reports** — today's takings by payment method and by product, queried
  live from `transactions`/`transaction_lines`.

## Local development

The app now expects a real backend — there's no mock-data fallback. Point
it at a deployed environment:

```bash
npm install
cp public/config.example.json public/config.json   # fill in values from `cdk deploy` outputs
npm run dev
```

## Deploying to AWS

### Prerequisites

- An AWS account
- [AWS CLI](https://aws.amazon.com/cli/) installed and configured
  (`aws configure` or an SSO profile) with credentials that can create the
  resources below
- Node.js 20+

### First deploy

```bash
# 1. Install dependencies
npm install
cd infra && npm install && cd ..

# 2. Build the frontend — the CDK stack deploys ../dist to S3
npm run build

# 3. One-time per account/region
cd infra
npx cdk bootstrap aws://ACCOUNT_ID/REGION

# 4. Deploy everything
npx cdk deploy
```

This takes ~10–15 minutes, mostly for the Aurora Serverless v2 cluster.
Note the outputs it prints (`SiteUrl`, `ApiUrl`, `UserPoolId`,
`UserPoolClientId`, `DbClusterArn`, `DbSecretArn`, `DbName`) — you'll need
several of them next.

```bash
# 5. Load the schema + seed data
node scripts/init-db.mjs \
  --cluster-arn <DbClusterArn> \
  --secret-arn <DbSecretArn> \
  --database luxor

# 6. Create the shared till login (Cognito)
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username till@yoursalon.co.uk \
  --user-attributes Name=email,Value=till@yoursalon.co.uk Name=email_verified,Value=true \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> \
  --username till@yoursalon.co.uk \
  --password 'ChooseAStrongPassword1!' \
  --permanent
```

Visit the `SiteUrl` output and sign in with that email/password.

### Redeploying

- Frontend-only change: `npm run build && cd infra && npx cdk deploy`
- Backend/Lambda change: `cd infra && npx cdk deploy` (the Lambda
  re-bundles automatically from `infra/lambda/`)
- Schema change: edit `db/schema.sql`, then re-run `scripts/init-db.mjs`
  with `--schema-only` for just the DDL, or write a proper migration once
  there's real data you can't safely re-seed over.

### Cost notes

Aurora Serverless v2's minimum capacity (0.5 ACU, set in
`luxor-stack.ts`) bills continuously — roughly $45–65/month baseline even
at zero traffic — unlike the Lambda/API Gateway/S3/CloudFront/Cognito
pieces, which scale down to near-zero cost when the salon's closed. If
you're not using the deployment day to day yet, `cd infra && npx cdk
destroy` tears it down (the DB and S3 bucket use `RETAIN`/`SNAPSHOT`
removal policies, so a stray `destroy` won't silently delete real
customer data — clean those up manually in the console if you actually
want them gone).

### Follow-ups worth doing before real customer data goes in

1. Tighten CORS: `luxor-stack.ts` currently allows `*` for the HTTP API
   so the first deploy works before the CloudFront domain is known;
   narrow `allowOrigins` to the real `SiteUrl` afterwards.
2. Import historical data from the old sheets into read-only archive
   tables rather than reconciling years of free-text history into the new
   schema.
3. Hardware: receipt printer / cash drawer integration, barcode scanner
   for stock intake.
4. Consider per-staff Cognito accounts (instead of one shared till login)
   if you want clock-in/out tied to an authenticated identity rather than
   just a name picked on a shared device.
