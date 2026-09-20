#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const schemaPath = path.join(root, 'src/db/schema.ts');
const baselinePath = path.join(root, 'drizzle/0000_baseline.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
const sql = fs.readFileSync(baselinePath, 'utf8');

const expectedTables = [...schema.matchAll(/pgTable\(\s*["']([^"']+)["']/g)].map(m => m[1]).sort();
const expectedEnums = [...schema.matchAll(/pgEnum\(\s*["']([^"']+)["']/g)].map(m => m[1]).sort();
const actualTables = [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"?)([a-z0-9_]+)(?:"?)/gi)].map(m => m[1]).sort();
const actualEnums = [...sql.matchAll(/CREATE TYPE\s+(?:"?)([a-z0-9_]+)(?:"?)\s+AS ENUM/gi)].map(m => m[1]).sort();

function diff(a, b) { return a.filter(x => !b.includes(x)); }
const failures = [];
const missingTables = diff(expectedTables, actualTables);
const extraTables = diff(actualTables, expectedTables);
const missingEnums = diff(expectedEnums, actualEnums);
const extraEnums = diff(actualEnums, expectedEnums);
if (missingTables.length) failures.push(`missing tables: ${missingTables.join(', ')}`);
if (extraTables.length) failures.push(`extra tables: ${extraTables.join(', ')}`);
if (missingEnums.length) failures.push(`missing enums: ${missingEnums.join(', ')}`);
if (extraEnums.length) failures.push(`extra enums: ${extraEnums.join(', ')}`);

for (const [, target] of sql.matchAll(/REFERENCES\s+(?:"?)([a-z0-9_]+)(?:"?)\s*\(/gi)) {
  if (!actualTables.includes(target)) failures.push(`FK references unknown table: ${target}`);
}

// AST-based column parity: catches a baseline that has all table names but
// silently forgets/renames a column. This runs without project dependencies
// by using the globally installed TypeScript parser available in the QA host.
try {
  const req = createRequire(import.meta.url);
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 5000 }).trim();
  const ts = req(path.join(globalRoot, 'typescript/lib/typescript.js'));
  const sf = ts.createSourceFile(schemaPath, schema, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const schemaColumns = new Map();

  function findColumnName(node) {
    let found = null;
    function visit(n) {
      if (found) return;
      if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isStringLiteralLike(n.arguments[0])) {
        const callee = n.expression;
        const name = ts.isIdentifier(callee) ? callee.text : null;
        if (name) {
          found = n.arguments[0].text;
          return;
        }
      }
      ts.forEachChild(n, visit);
    }
    visit(node);
    return found;
  }

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'pgTable') {
      const [nameArg, colsArg] = node.arguments;
      if (nameArg && ts.isStringLiteralLike(nameArg) && colsArg && ts.isObjectLiteralExpression(colsArg)) {
        const cols = [];
        for (const p of colsArg.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const dbName = findColumnName(p.initializer);
          if (dbName) cols.push(dbName);
        }
        schemaColumns.set(nameArg.text, cols.sort());
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  const sqlColumns = new Map();
  for (const m of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?([a-z0-9_]+)"?\s*\(\n([\s\S]*?)\n\);/gi)) {
    const [, table, body] = m;
    const cols = [];
    for (const line of body.split(/\r?\n/)) {
      const cm = line.match(/^\s{2}"?([a-z_][a-z0-9_]*)"?\s+/i);
      if (cm && cm[1].toUpperCase() !== 'CONSTRAINT') cols.push(cm[1]);
    }
    sqlColumns.set(table, cols.sort());
  }

  for (const [table, expected] of schemaColumns) {
    const actual = sqlColumns.get(table) ?? [];
    const missing = diff(expected, actual);
    const extra = diff(actual, expected);
    if (missing.length || extra.length) failures.push(`column parity ${table}: missing=[${missing.join(', ')}] extra=[${extra.join(', ')}]`);
  }
} catch (error) {
  failures.push(`column parity checker unavailable: ${error.message}`);
}

if (!/CREATE UNIQUE INDEX\s+bookings_active_itinerary_item_unique/i.test(sql)) failures.push('active itinerary booking uniqueness index missing');
if (!/CREATE UNIQUE INDEX\s+payments_active_booking_unique/i.test(sql)) failures.push('active booking payment uniqueness index missing');
if (!/CREATE UNIQUE INDEX\s+payments_provider_ref_unique/i.test(sql)) failures.push('external payment provider reference uniqueness missing');
if (!/auth_accounts_provider_account_unique/i.test(sql)) failures.push('Google provider identity uniqueness missing');
if (!/CREATE UNIQUE INDEX\s+providers_owner_user_unique/i.test(sql)) failures.push('single-business provider-owner uniqueness missing');
if (!/token_hash text NOT NULL UNIQUE/i.test(sql)) failures.push('session token hash uniqueness missing');
if (!/CONSTRAINT\s+provider_services_price_amount_check\s+CHECK/i.test(sql)) failures.push('provider service authoritative price bound missing');
if (!/CONSTRAINT\s+provider_services_currency_check\s+CHECK/i.test(sql)) failures.push('provider service currency integrity check missing');
if (!/CONSTRAINT\s+provider_services_duration_check\s+CHECK/i.test(sql)) failures.push('provider service duration integrity check missing');
if (!/CONSTRAINT\s+provider_services_capacity_check\s+CHECK/i.test(sql)) failures.push('provider service capacity integrity check missing');
if (!/CONSTRAINT\s+bookings_guests_count_check\s+CHECK/i.test(sql)) failures.push('booking guest-count integrity check missing');
if (!/CONSTRAINT\s+bookings_total_amount_check\s+CHECK/i.test(sql)) failures.push('booking total-amount integrity check missing');
if (!/CONSTRAINT\s+bookings_currency_check\s+CHECK/i.test(sql)) failures.push('booking currency integrity check missing');
if (!/CONSTRAINT\s+payments_amount_check\s+CHECK/i.test(sql)) failures.push('payment amount integrity check missing');
if (!/CONSTRAINT\s+payments_currency_check\s+CHECK/i.test(sql)) failures.push('payment currency integrity check missing');

if (failures.length) {
  console.error('Baseline schema QA FAILED');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`Baseline schema QA PASS: ${actualTables.length} tables, ${actualEnums.length} enums, column parity holds, all FK targets known, critical uniqueness indexes present.`);
