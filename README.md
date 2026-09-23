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
- **[db/import/](db/import)** + **[infra/scripts/import-data.mjs](infra/scripts/import-data.mjs)**
  — CSV-based cutover import for loading the salon's real data (see
  "Cutover" below).
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

# 6. Create logins (Cognito). Two account types:
#    - till: POS, Customers, Timesheets only
#    - admin: everything, including Stock, Rota, Reports (must be added to
#      the "admin" Cognito group — see infra/lib/luxor-stack.ts, AdminGroup)
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

aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username admin@yoursalon.co.uk \
  --user-attributes Name=email,Value=admin@yoursalon.co.uk Name=email_verified,Value=true \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> \
  --username admin@yoursalon.co.uk \
  --password 'ChooseAnotherStrongPassword1!' \
  --permanent

aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username admin@yoursalon.co.uk \
  --group-name admin
```

Visit the `SiteUrl` output and sign in with either account.

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
2. Hardware: receipt printer / cash drawer integration, barcode scanner
   for stock intake.
3. Consider per-staff Cognito accounts (instead of one shared till login)
   if you want clock-in/out tied to an authenticated identity rather than
   just a name picked on a shared device.

## Continuous integration

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push and
PR: type-checks and builds the frontend, and type-checks + `cdk synth`s the
infra/Lambda code. Neither job needs AWS credentials — `cdk synth` runs in
environment-agnostic mode (dummy availability zones, no live lookups), the
same way it does locally without `aws configure`. It's a check, not a
deploy: nothing in CI touches your AWS account. Wiring up auto-deploy on
push to `main` is a deliberate next step, not done here, since it requires
adding AWS credentials as repo secrets yourself.

## Cutover: importing real salon data

Once the schema is deployed (`scripts/init-db.mjs`), replace the demo data
from `db/seed.sql` with the salon's actual data using
[infra/scripts/import-data.mjs](infra/scripts/import-data.mjs):

1. Export each relevant tab from the Google Sheets workbook and reshape it
   into the four CSVs the importer expects — templates with the exact
   columns are in [db/import/*.example.csv](db/import). Copy each to the
   same name without `.example` (e.g. `db/import/customers.csv`) and fill
   it in. These real files are gitignored — they'll contain customer PII
   and should never be committed.
   - **`minutes_balance` needs a human pass.** The old sheet tracked this
     as free text in a Comments cell (e.g. "80 mins left"), which is
     exactly the failure mode this system replaces — someone needs to read
     each customer's current balance off the sheet and enter it as a clean
     integer. There's no way to script around that safely.
2. Dry-run it — this only validates the CSVs, no DB connection needed:
   ```bash
   node infra/scripts/import-data.mjs --dir db/import
   ```
   It reports every problem at once (bad category, a stock row pointing at
   a product name that doesn't exist, non-numeric balances, etc.) rather
   than stopping at the first one.
3. Once it reports all rows valid, actually import:
   ```bash
   node infra/scripts/import-data.mjs \
     --cluster-arn <DbClusterArn> --secret-arn <DbSecretArn> --database luxor \
     --dir db/import --confirm
   ```
   Products and stock are upserted by product name (safe to re-run as the
   catalogue changes); customers and staff are append-only inserts, so
   don't re-run those two against a database that already has live
   transactions against them. Everything happens inside one Data API
   transaction — a bad row rolls back the whole import, never a partial
   one.
