#!/usr/bin/env node
import { createRequire } from 'node:module';
import { buildProgram } from './cli/program.js';

const _require = createRequire(import.meta.url);
const pkg = _require('../package.json') as { version: string };

// The exit code is set rather than passed to process.exit, so that output
// still buffered for a pipe is written before the process ends.
process.exitCode = await buildProgram({ stdout: process.stdout, stderr: process.stderr }, { version: pkg.version }).run(
  process.argv.slice(2),
);
