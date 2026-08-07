#!/usr/bin/env node
// Cutover data import: loads products/stock/customers/staff from CSV files
// exported out of the old Google Sheets workbook into the real database.
//
// Usage:
//   node infra/scripts/import-data.mjs \
//     --cluster-arn <arn> --secret-arn <arn> --database luxor \
//     --dir db/import [--confirm]
//
// Without --confirm this only validates the CSVs and prints what it would
// do — nothing is written. Pass --confirm to actually import. All writes
// happen inside a single Data API transaction: either everything applies
// or nothing does, so a bad row can't leave the database half-migrated.
//
// Expected files in --dir (see db/import/*.example.csv for the format):
//   products.csv   name,category,price_pence,minutes,track_stock
//   stock.csv      product_name,quantity_on_hand,reorder_level,supplier
//   customers.csv  name,phone,email,minutes_balance,notes
//   staff.csv      name,role,pay_rate_pence,active

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { confirm: false, dir: path.join(__dirname, '..', '..', 'db', 'import') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cluster-arn') args.clusterArn = argv[++i];
    else if (a === '--secret-arn') args.secretArn = argv[++i];
    else if (a === '--database') args.database = argv[++i];
    else if (a === '--dir') args.dir = argv[++i];
    else if (a === '--confirm') args.confirm = true;
  }
  return args;
}

function readCsv(dir, filename) {
  const file = path.join(dir, filename);
  if (!existsSync(file)) return null;
  const content = readFileSync(file, 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

const isBool = (v) => ['true', 'false', ''].includes(String(v).toLowerCase());
const toBool = (v, fallback) => (v === '' || v === undefined ? fallback : String(v).toLowerCase() === 'true');
const isInt = (v) => v !== '' && Number.isInteger(Number(v));

// ---------------------------------------------------------------------------
// Validation — collects every problem instead of failing on the first, so a
// salon owner fixing a spreadsheet export can see the whole list at once.
// ---------------------------------------------------------------------------

function validateProducts(rows) {
  const errors = [];
  const names = new Set();
  rows.forEach((r, i) => {
    const line = `products.csv row ${i + 2}`;
    if (!r.name) errors.push(`${line}: missing name`);
    else if (names.has(r.name)) errors.push(`${line}: duplicate product name "${r.name}"`);
    else names.add(r.name);
    if (!['tanning_minutes', 'retail'].includes(r.category)) {
      errors.push(`${line}: category must be tanning_minutes or retail, got "${r.category}"`);
    }
    if (!isInt(r.price_pence) || Number(r.price_pence) < 0) {
      errors.push(`${line}: price_pence must be a non-negative integer, got "${r.price_pence}"`);
    }
    if (r.category === 'tanning_minutes' && !isInt(r.minutes)) {
      errors.push(`${line}: minutes is required and must be an integer for tanning_minutes products`);
    }
    if (!isBool(r.track_stock)) errors.push(`${line}: track_stock must be true/false`);
  });
  return errors;
}

function validateStock(rows, productNames) {
  const errors = [];
  rows.forEach((r, i) => {
    const line = `stock.csv row ${i + 2}`;
    if (!r.product_name) errors.push(`${line}: missing product_name`);
    else if (!productNames.has(r.product_name)) {
      errors.push(`${line}: product_name "${r.product_name}" not found in products.csv`);
    }
    if (!isInt(r.quantity_on_hand) || Number(r.quantity_on_hand) < 0) {
      errors.push(`${line}: quantity_on_hand must be a non-negative integer`);
    }
    if (!isInt(r.reorder_level) || Number(r.reorder_level) < 0) {
      errors.push(`${line}: reorder_level must be a non-negative integer`);
    }
  });
  return errors;
}

function validateCustomers(rows) {
  const errors = [];
  rows.forEach((r, i) => {
    const line = `customers.csv row ${i + 2}`;
    if (!r.name) errors.push(`${line}: missing name`);
    if (r.minutes_balance !== '' && (!isInt(r.minutes_balance) || Number(r.minutes_balance) < 0)) {
      errors.push(`${line}: minutes_balance must be a non-negative integer if set, got "${r.minutes_balance}"`);
    }
  });
  return errors;
}

function validateStaff(rows) {
  const errors = [];
  rows.forEach((r, i) => {
    const line = `staff.csv row ${i + 2}`;
    if (!r.name) errors.push(`${line}: missing name`);
    if (!['owner', 'manager', 'staff'].includes(r.role)) {
      errors.push(`${line}: role must be owner, manager, or staff, got "${r.role}"`);
    }
    if (!isInt(r.pay_rate_pence) || Number(r.pay_rate_pence) < 0) {
      errors.push(`${line}: pay_rate_pence must be a non-negative integer`);
    }
    if (!isBool(r.active)) errors.push(`${line}: active must be true/false`);
  });
  return errors;
}

// ---------------------------------------------------------------------------

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.confirm && (!args.clusterArn || !args.secretArn || !args.database)) {
    console.error('--confirm requires --cluster-arn, --secret-arn, and --database');
    process.exit(1);
  }

  const products = readCsv(args.dir, 'products.csv') ?? [];
  const stock = readCsv(args.dir, 'stock.csv') ?? [];
  const customers = readCsv(args.dir, 'customers.csv') ?? [];
  const staff = readCsv(args.dir, 'staff.csv') ?? [];

  const errors = [
    ...validateProducts(products),
    ...validateStock(stock, new Set(products.map((p) => p.name))),
    ...validateCustomers(customers),
    ...validateStaff(staff),
  ];

  console.log(`Read from ${args.dir}:`);
  console.log(`  products.csv  ${products.length} row(s)`);
  console.log(`  stock.csv     ${stock.length} row(s)`);
  console.log(`  customers.csv ${customers.length} row(s)`);
  console.log(`  staff.csv     ${staff.length} row(s)`);

  if (errors.length > 0) {
    console.log(`\n${errors.length} problem(s) found — nothing was written:\n`);
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }

  console.log('\nAll rows valid.');

  if (!args.confirm) {
    console.log('\nDry run only (pass --confirm to actually import). No changes made.');
    return;
  }

  const client = new RDSDataClient({});
  const opts = { resourceArn: args.clusterArn, secretArn: args.secretArn, database: args.database };

  const { transactionId } = await client.send(new BeginTransactionCommand(opts));
  if (!transactionId) throw new Error('Failed to start transaction');

  const exec = (sql, parameters) =>
    client.send(new ExecuteStatementCommand({ ...opts, sql, parameters, transactionId, includeResultMetadata: true }));

  const param = (name, value) => ({
    name,
    value: value === '' || value === null || value === undefined ? { isNull: true } : { stringValue: String(value) },
  });

  try {
    for (const p of products) {
      await exec(
        `insert into products (name, category, price_pence, minutes, track_stock)
         values (:name, :category, :price_pence::integer, :minutes::integer, :track_stock::boolean)
         on conflict (name) do update set
           category = excluded.category,
           price_pence = excluded.price_pence,
           minutes = excluded.minutes,
           track_stock = excluded.track_stock`,
        [
          param('name', p.name),
          param('category', p.category),
          param('price_pence', p.price_pence),
          param('minutes', p.minutes || null),
          param('track_stock', toBool(p.track_stock, false)),
        ],
      );
    }
    console.log(`Upserted ${products.length} product(s).`);

    for (const s of stock) {
      const result = await exec(`select id from products where name = :name`, [param('name', s.product_name)]);
      const productId = result.records?.[0]?.[0]?.stringValue;
      await exec(
        `insert into stock_items (product_id, quantity_on_hand, reorder_level, supplier)
         values (:product_id::uuid, :qty::integer, :reorder::integer, :supplier)
         on conflict (product_id) do update set
           quantity_on_hand = excluded.quantity_on_hand,
           reorder_level = excluded.reorder_level,
           supplier = excluded.supplier,
           updated_at = now()`,
        [
          param('product_id', productId),
          param('qty', s.quantity_on_hand),
          param('reorder', s.reorder_level),
          param('supplier', s.supplier || null),
        ],
      );
    }
    console.log(`Upserted ${stock.length} stock row(s).`);

    for (const c of customers) {
      await exec(
        `insert into customers (name, phone, email, minutes_balance, notes)
         values (:name, :phone, :email, :minutes_balance::integer, :notes)`,
        [
          param('name', c.name),
          param('phone', c.phone || null),
          param('email', c.email || null),
          param('minutes_balance', c.minutes_balance || 0),
          param('notes', c.notes || null),
        ],
      );
    }
    console.log(`Inserted ${customers.length} customer(s).`);

    for (const s of staff) {
      await exec(
        `insert into staff (name, role, pay_rate_pence, active)
         values (:name, :role, :pay_rate_pence::integer, :active::boolean)`,
        [
          param('name', s.name),
          param('role', s.role),
          param('pay_rate_pence', s.pay_rate_pence),
          param('active', toBool(s.active, true)),
        ],
      );
    }
    console.log(`Inserted ${staff.length} staff member(s).`);

    await client.send(new CommitTransactionCommand({ ...opts, transactionId }));
    console.log('\nImport committed.');
  } catch (err) {
    await client.send(new RollbackTransactionCommand({ ...opts, transactionId }));
    console.error('\nImport failed and was rolled back:', err);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
