/**
 * Reading a `--dir` tree into the mutator's file record and writing the
 * mutator's files back.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative, extname, isAbsolute } from 'node:path';
import type { LikeC4Mutator } from '../mutator/mutator.js';
import { getServices } from '../parser/services.js';

/** The file extensions LikeC4 reads (`.c4`, `.likec4`, `.like-c4`), from its language metadata. */
export function likec4FileExtensions(): readonly string[] {
  return getServices().likec4.LanguageMetaData.fileExtensions;
}

/** The extensions as a text for messages and option descriptions: `.c4, .likec4, .like-c4`. */
export function likec4FileExtensionList(): string {
  return likec4FileExtensions().join(', ');
}

/**
 * Recursively load every LikeC4 file (see {@link likec4FileExtensions}) of a
 * directory tree.  Returns a record mapping relative paths to file contents.
 */
export function loadDirectory(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const absDir = resolve(dir);
  const extensions = likec4FileExtensions();

  if (!existsSync(absDir)) {
    throw new Error(`Directory not found: ${absDir}`);
  }
  if (!statSync(absDir).isDirectory()) {
    throw new Error(`Not a directory: ${absDir}`);
  }

  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extensions.includes(extname(entry))) {
        const relPath = relative(absDir, fullPath);
        files[relPath] = readFileSync(fullPath, 'utf-8');
      }
    }
  }

  walk(absDir);
  return files;
}

/**
 * Write mutator's serialized files to the given output directory,
 * preserving the relative path structure: each file under its own relative
 * path and extension.
 */
export function writeOutput(mutator: LikeC4Mutator, outputDir: string) {
  const absOutputDir = resolve(outputDir);
  const files = mutator.serialize();
  mkdirSync(absOutputDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    const outPath = resolve(absOutputDir, filename);
    // Prevent path traversal: ensure resolved output path stays within the output directory.
    // Use path.relative for cross-platform safety (POSIX `/` vs Windows `\`).
    const rel = relative(absOutputDir, outPath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Path traversal detected: '${filename}' resolves outside output directory`);
    }
    mkdirSync(resolve(outPath, '..'), { recursive: true });
    writeFileSync(outPath, content, 'utf-8');
  }
}
