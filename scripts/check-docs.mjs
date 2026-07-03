import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const markdownFiles = execFileSync(
  'rg',
  [
    '--files',
    '--hidden',
    '-g',
    '*.md',
    '-g',
    '!.git/**',
    '-g',
    '!node_modules/**',
    '-g',
    '!coverage/**',
  ],
  {
    encoding: 'utf8',
  }
)
  .trim()
  .split('\n')
  .filter(Boolean);

const failures = [];
const markdownLink = /!?\[[^\]]*]\(([^)]+)\)/g;
const decorativeEmoji = /\p{Extended_Pictographic}/u;

for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8');

  if (decorativeEmoji.test(content)) {
    failures.push(`${file}: contains decorative emoji`);
  }

  for (const match of content.matchAll(markdownLink)) {
    const destination = match[1].trim().replace(/^<|>$/g, '');
    if (
      destination.startsWith('#') ||
      destination.startsWith('http://') ||
      destination.startsWith('https://') ||
      destination.startsWith('mailto:')
    ) {
      continue;
    }

    const path = decodeURIComponent(destination.split('#', 1)[0]);
    const target = resolve(dirname(file), path);
    if (!existsSync(target)) {
      failures.push(`${file}: missing link target ${destination}`);
    }
  }
}

assert.deepEqual(failures, [], failures.join('\n'));
console.log(`Documentation verified (${markdownFiles.length} Markdown files).`);
