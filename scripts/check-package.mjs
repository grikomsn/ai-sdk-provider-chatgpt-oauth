import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const expectedFiles = [
  'LICENSE',
  'README.md',
  'dist/codex-apply-patch-instructions.txt',
  'dist/codex-gpt5-codex-instructions.txt',
  'dist/codex-instructions.txt',
  'dist/index.d.ts',
  'dist/index.js',
  'package.json',
];

const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});
const [pack] = JSON.parse(output);
const actualFiles = pack.files.map(({ path }) => path).sort();

assert.deepEqual(
  actualFiles,
  expectedFiles,
  `Published files changed.\nExpected: ${expectedFiles.join(', ')}\nActual: ${actualFiles.join(', ')}`
);

console.log(`Package contents verified (${actualFiles.length} files, ${pack.size} bytes).`);
