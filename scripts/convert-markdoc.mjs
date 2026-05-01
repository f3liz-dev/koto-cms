#!/usr/bin/env node
// Usage:
//   node --experimental-strip-types scripts/convert-markdoc.mjs <input.md>       → stdout
//   node --experimental-strip-types scripts/convert-markdoc.mjs <in.md> <out.md> → writes to out.md
//   cat in.md | node --experimental-strip-types scripts/convert-markdoc.mjs     → stdin → stdout
//
// Intended for VitePress target repositories: wire this into their build step
// (e.g. an npm script or a pre-build walker) to translate Markdoc source files
// into the Markdown/container-directive dialect VitePress consumes.

import { readFile, writeFile } from 'node:fs/promises';
import { markdocToVitepress } from '../web/lib/markdocToVitepress.ts';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const [, , inPath, outPath] = process.argv;

const source = inPath ? await readFile(inPath, 'utf8') : await readStdin();
const converted = markdocToVitepress(source);

if (outPath) {
  await writeFile(outPath, converted, 'utf8');
} else {
  process.stdout.write(converted);
}
