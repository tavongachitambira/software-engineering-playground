#!/usr/bin/env node
// Scaffolds a new topic folder from topics/_template.
// Usage: node scripts/new-topic.mjs <category> <slug> "<Title>"
// Example: node scripts/new-topic.mjs authentication jwt "JWT Authentication"

import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE_DIR = join(ROOT, 'topics', '_template');

const [category, slug, ...titleParts] = process.argv.slice(2);

if (!category || !slug) {
  console.error('Usage: node scripts/new-topic.mjs <category> <slug> "<Title>"');
  console.error('Example: node scripts/new-topic.mjs authentication jwt "JWT Authentication"');
  process.exit(1);
}

const title =
  titleParts.join(' ') ||
  slug
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');

const date = new Date().toISOString().slice(0, 10);
const targetDir = join(ROOT, 'topics', category, slug);

if (existsSync(targetDir)) {
  console.error(`Topic already exists: topics/${category}/${slug}`);
  process.exit(1);
}

function copyAndFill(src, dest) {
  const stat = statSync(src);
  if (stat.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyAndFill(join(src, entry), join(dest, entry));
    }
  } else {
    let content = readFileSync(src, 'utf-8');
    content = content
      .replaceAll('{{TITLE}}', title)
      .replaceAll('{{CATEGORY}}', category)
      .replaceAll('{{SLUG}}', slug)
      .replaceAll('{{DATE}}', date);
    writeFileSync(dest, content);
  }
}

copyAndFill(TEMPLATE_DIR, targetDir);

console.log(`Created topics/${category}/${slug}/`);
console.log('Next steps:');
console.log(`  1. Fill in topics/${category}/${slug}/README.md`);
console.log(`  2. Decide where the runnable example lives (see docs/how-to-add-an-example.md)`);
console.log(`  3. Run: pnpm topics:index`);
