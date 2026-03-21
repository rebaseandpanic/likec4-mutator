# release [log] [push] [additional-message]

```
argument-hint: [log] [push] [additional-message] (optional: 'log' to update changelog first, 'push' to tag+push)
description: Bump version, update changelog, commit, tag and push npm package release

Release npm package (release)

Context
* This command bumps version, updates CHANGELOG.md, commits, tags and pushes
* Version format: `0.X.Y` (NO `v` prefix anywhere — tags, changelog, package.json)
* Single branch: `main` only
* Mono-repo npm package structure
* Analyzes current session or git diff for changelog entries

**CRITICAL:**
* **NEVER use Write tool on existing CHANGELOG.md — ALWAYS use Edit tool**
* **Version must be bumped in ALL files where it appears (package.json, src/cli.ts, etc.)**
* **Tags are plain version numbers: `0.2.0`, NOT `v0.2.0`**

---

## STEP 0: Parse Arguments

- `/release` — bump + changelog + commit only (no push)
- `/release push` — bump + changelog + commit + tag + push
- `/release log` — analyze session → update changelog + bump + commit
- `/release log push` — analyze session → update changelog + bump + commit + tag + push
- `/release log push "message"` — all above + additional message in commit

---

## STEP 1: Determine Current and Next Version

1. Get latest git tag:
   ```bash
   git tag --sort=-creatordate | head -1
   ```
   If no tags exist, current version is `0.0.0`.

2. Read version from `package.json`:
   ```bash
   node -e "console.log(require('./package.json').version)"
   ```

3. Check CHANGELOG.md for latest version section (if file exists).

4. Determine next version:
   - If CHANGELOG version > git tag → **UNRELEASED version exists, ADD to existing section**
   - If CHANGELOG version = git tag (or no changelog) → **Increment: bump patch `0.1.0` → `0.1.1`, or minor `0.1.1` → `0.2.0` for features**
   - Ask user to confirm version if unclear whether it's patch or minor bump

**Version bump rules:**
- `[FEATURE]` or `[ARCHITECTURE]` → bump **minor** (`0.1.0` → `0.2.0`)
- `[BUGFIX]`, `[PERFORMANCE]`, `[UX]`, no prefix → bump **patch** (`0.1.0` → `0.1.1`)
- If mixed, use the highest bump level

---

## STEP 2: Analyze Changes (only if "log" argument provided)

**Skip to STEP 3 if "log" was NOT provided.**

### Scenario A: Session has context
- Review conversation history for what was implemented
- Use session context as primary source

### Scenario B: Session is empty/new
- Run `git status --short` and `git diff` for all changed files
- Analyze code changes to understand what was done

**Prefixes:**
- `[FEATURE]` — new functionality
- `[UX]` — UI/UX improvements
- `[BUGFIX]` — bug fixes
- `[PERFORMANCE]` — performance improvements
- `[ARCHITECTURE]` — significant architectural changes
- No prefix — standalone technical changes

**Group related tasks** — implementation details, docs, tests under main feature. Don't fragment.

---

## STEP 3: Update CHANGELOG.md

**If CHANGELOG.md doesn't exist, create it:**
```markdown
# Changelog

## [0.1.0] - YYYY-MM-DD
- [FEATURE] Initial release: parser, query, mutation, CLI
```

**If CHANGELOG.md exists:**
- If unreleased version section exists → add entries to it
- If new version needed → add new section at TOP (below `# Changelog` header)

Format:
```markdown
## [0.2.0] - 2026-03-21
- [FEATURE] Add new functionality
- [BUGFIX] Fix issue
```

**Check for duplicates** — skip entries that already exist (semantic match).

**CRITICAL: Use Edit tool, never Write tool on existing CHANGELOG.md**

---

## STEP 4: Bump Version in All Files

Find and update version in:

1. **`package.json`** — `"version": "0.2.0"`
2. **`src/cli.ts`** — if it has `.version('0.1.0')`, update it
3. **Any other file** — grep for the old version string, update if it's a version reference

```bash
# Find files containing the old version (to verify what needs bumping)
grep -r "0.1.0" --include="*.ts" --include="*.json" -l src/ package.json
```

**Use Edit tool for each file. Verify the replacement is a version string, not a dependency version.**

---

## STEP 5: Stage and Commit

```bash
git add -A
```

**Commit message format:**
- Entries from changelog (without `[FEATURE]`/`[BUGFIX]` prefixes)
- Additional translated message if provided
- Version number NOT in commit message body

```
Add new functionality
Fix issue
Additional message

Vibe-Coded-By: Human — [dark humorous Claude Code credit] 💀
```

**Dark humor examples for attribution:**
- `Vibe-Coded-By: Human — Fatal-Exception-Triggered-By Claude Code 💀`
- `Vibe-Coded-By: Human — Sleep-Deprived-By Claude Code 🧟`
- `Vibe-Coded-By: Human — Prod-Database-Wiped-By Claude Code 🔥`
- `Vibe-Coded-By: Human — Hope-Killed-By Claude Code 🖤`
- `Vibe-Coded-By: Human — Career-Limiting-Move courtesy of Claude Code ⚰️`

---

## STEP 6: Tag and Push (only if "push" argument provided)

**Skip if "push" was NOT provided.**

1. Extract version from CHANGELOG.md (first `## [X.Y.Z]` section)
2. Check if tag already exists:
   ```bash
   git tag -l "0.2.0"
   ```
   **If exists → STOP with error: "Tag 0.2.0 already exists"**

3. Create annotated tag (NO `v` prefix):
   ```bash
   git tag -a 0.2.0 -m "0.2.0"
   ```

4. Push commit and tag:
   ```bash
   git push --follow-tags
   ```

---

## STEP 7: Show Summary

- Version: `0.1.0` → `0.2.0`
- Files bumped: list files
- Changelog entries added: list entries
- Tag created: yes/no
- Pushed: yes/no

---

# Important Rules

* **Version format: `0.X.Y` — NO `v` prefix anywhere**
* **Tags are plain: `0.2.0`, not `v0.2.0`**
* **Bump version in ALL files where it appears**
* **NEVER use Write tool on existing CHANGELOG.md**
* **Always check for duplicate entries**
* **Translate additional messages to English**
* **Strip [FEATURE]/[BUGFIX] prefixes from commit message**
* **Always use annotated tags (`git tag -a`)**
* **If tag exists → STOP with error, never overwrite**
* **Branch: main only**

Execute steps in order. Show version detection, changelog preview, and file bump list before committing.
```
