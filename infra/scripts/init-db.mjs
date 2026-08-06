#!/usr/bin/env node
// Applies db/schema.sql (and, unless --schema-only is passed, db/seed.sql)
// to the deployed Aurora cluster via the RDS Data API.
//
// Usage:
//   node infra/scripts/init-db.mjs \
//     --cluster-arn <arn> --secret-arn <arn> --database luxor [--schema-only]
//
// Values for --cluster-arn/--secret-arn come from the CDK stack outputs
// (DbClusterArn / DbSecretArn) printed after `cdk deploy`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  RDSDataClient,
  ExecuteStatementCommand,
} from '@aws-sdk/client-rds-data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { schemaOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cluster-arn') args.clusterArn = argv[++i];
    else if (a === '--secret-arn') args.secretArn = argv[++i];
    else if (a === '--database') args.database = argv[++i];
    else if (a === '--schema-only') args.schemaOnly = true;
  }
  return args;
}

// Splits a SQL file into individual statements, keeping $$ ... $$
// dollar-quoted bodies (used by CREATE FUNCTION) intact instead of
// splitting on the semicolons inside them.
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  let dollarTag = null; // null when not inside a dollar-quoted block

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (dollarTag === null) {
      const tagMatch = rest.match(/^\$[a-zA-Z_]*\$/);
      if (tagMatch) {
        dollarTag = tagMatch[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
      if (sql[i] === ';') {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = '';
        i++;
        continue;
      }
    } else if (rest.startsWith(dollarTag)) {
      current += dollarTag;
      i += dollarTag.length;
      dollarTag = null;
      continue;
    }

    current += sql[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements.filter((s) => s.length > 0);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.clusterArn || !args.secretArn || !args.database) {
    console.error('Usage: node init-db.mjs --cluster-arn <arn> --secret-arn <arn> --database <name> [--schema-only]');
    process.exit(1);
  }

  const client = new RDSDataClient({});
  const repoRoot = path.join(__dirname, '..', '..');

  const files = [path.join(repoRoot, 'db', 'schema.sql')];
  if (!args.schemaOnly) files.push(path.join(repoRoot, 'db', 'seed.sql'));

  for (const file of files) {
    console.log(`\n== ${path.relative(repoRoot, file)} ==`);
    const sql = readFileSync(file, 'utf8');
    const statements = splitStatements(sql);

    for (const [idx, statement] of statements.entries()) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 80);
      process.stdout.write(`  [${idx + 1}/${statements.length}] ${preview}...`);
      try {
        await client.send(
          new ExecuteStatementCommand({
            resourceArn: args.clusterArn,
            secretArn: args.secretArn,
            database: args.database,
            sql: statement,
          }),
        );
        console.log(' ok');
      } catch (err) {
        console.log(' FAILED');
        throw err;
      }
    }
  }

  console.log('\nDatabase initialised.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
