#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scryptSync } from 'node:crypto';

const root = process.cwd();
const req = createRequire(import.meta.url);
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 5000 }).trim();
const ts = req(path.join(globalRoot, 'typescript/lib/typescript.js'));
const source = fs.readFileSync(path.join(root, 'src/lib/auth/password.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', js)(req, module, module.exports);
const { hashPassword, verifyPassword, passwordHashNeedsUpgrade } = module.exports;

const failures = [];
const current = hashPassword('Correct Horse Battery Staple');
if (!current.startsWith('scrypt2:32768:8:3:')) failures.push('new hash is not parameterized at the approved work factor');
if (!verifyPassword('Correct Horse Battery Staple', current)) failures.push('current hash rejects correct password');
if (verifyPassword('wrong', current)) failures.push('current hash accepts wrong password');
if (passwordHashNeedsUpgrade(current)) failures.push('current hash incorrectly marked for upgrade');

const salt = '11'.repeat(16);
const legacyKey = scryptSync('legacy-password', salt, 64).toString('hex');
const legacy = `scrypt:${salt}:${legacyKey}`;
if (!verifyPassword('legacy-password', legacy)) failures.push('legacy hash compatibility broken');
if (verifyPassword('wrong', legacy)) failures.push('legacy hash accepts wrong password');
if (!passwordHashNeedsUpgrade(legacy)) failures.push('legacy hash not marked for upgrade');

const malformed = [
  'scrypt:salt:',
  'scrypt:00000000000000000000000000000000:',
  `scrypt2:1073741824:8:1:${'00'.repeat(16)}:${'00'.repeat(64)}`,
  `scrypt2:32768:999:1:${'00'.repeat(16)}:${'00'.repeat(64)}`,
];
if (malformed.some(v => verifyPassword('anything', v))) failures.push('malformed/abusive hash failed closed');

if (failures.length) {
  console.error('Password runtime QA FAILED');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}
console.log('Password runtime QA PASS: current work factor, legacy compatibility, upgrade detection, wrong-password and malformed-hash rejection verified.');
