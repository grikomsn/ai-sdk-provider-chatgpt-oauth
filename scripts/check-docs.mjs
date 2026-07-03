import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules']);

function findMarkdownFiles(directory = '.') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : findMarkdownFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

const markdownFiles = findMarkdownFiles().sort();

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
