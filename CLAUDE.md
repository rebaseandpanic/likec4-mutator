## !! CRITICAL: No Fabrication. No Guessing. No Bluffing. !!

1. **Never make up numbers, statistics, or metrics.** If you don't have the data — say so.
2. **Never fabricate output.** Do not invent log lines, error messages, command results, API responses, or file contents. Only show real output you have actually observed.
3. **Never present speculation as fact.** If you are making an assumption or hypothesis, prefix it with "ASSUMPTION:" or "I believe ... (unverified)". The reader must always be able to distinguish verified facts from your inferences.
4. **When uncertain — stop and say "I don't know"** rather than producing a plausible-sounding guess. Then either research the answer or ask the user for clarification.
5. **Never invent technical details.** If you don't know an API endpoint, CLI flag, config option, package version, or environment variable — look it up or state explicitly that you don't know. Fabricating technical details leads to silent, hard-to-debug failures.

**Distinguish facts from assumptions:**
- "I verified X" = tested, observed, have evidence
- "I believe X" = theory, unverified — always label it explicitly as an assumption
- "Probably" is not evidence — show the proof or say you don't have it

The ranking: verified fact > "I don't know" > clearly-labeled guess > confident wrong answer. Aim for the left side.

## Project

**likec4-mutator** — see @README.md

## Key technical details

- **Parser**: `@likec4/language-server` standalone (no LSP), sync via `LangiumParser.parse()`
- **Mutation**: text replacement via CST positions, edits applied end→start
- **Limitation**: `LangiumParser.parse()` does not support `#tag` syntax without linking phase

## Repository structure

```
src/
  index.ts                  # Public API exports
  cli.ts                    # CLI entry point (commander)
  parser/                   # C4Parser — .c4 → AST + CST
  query/                    # C4Query — getElement, listElements, getRelationships
  mutator/                  # LikeC4Mutator — addElement, updateElement, removeElement, etc.
tests/                      # 144 tests (parser, query, mutator, cli, integration)
docs/
  specs/                    # Project specification
  research/                 # Langium/LikeC4 research results
research/                   # Experimental scripts (not shipped in npm)
```

## Build and test

```bash
npm install && npm run build && npm test
```
