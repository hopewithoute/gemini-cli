# Design Doc: Upstream Merge Analysis (main vs upstream/main)

**Date:** 2026-03-03 **Status:** Approved

## 1. Overview

The goal of this analysis is to provide a comprehensive view of the differences
between the local `main` branch and the `upstream/main` repository to facilitate
a smooth merge and potential PR back to upstream.

## 2. Divergence Status

The current divergence between the branches is significant:

- **Ahead:** 16 commits (local changes not in upstream).
- **Behind:** 32 commits (upstream changes not in local).
- **Common Ancestor:** Identified via `git merge-base`.

## 3. Commit Highlights

### 3.1 Upstream Highlights (Latest 5)

- `1e2afbb51` feat(cli): invert context window display to show usage (#20071)
- `208291f39` fix(ci): handle empty APP_ID in stale PR closer (#20919)
- `8303edbb5` Code review fixes as a pr (#20612)
- `0d69f9f7f` Build binary (#18933)
- `46231a175` ci(evals): only run evals in CI if prompts or tools changed
  (#20898)

### 3.2 Local Highlights (Latest 5)

- `ece2a11c8` Merge pull request #3 from hopewithoute/feat/meta-tools
- `1e9e87bd6` feat(core): implement meta-tools system (search & execute)
- `f20144cfe` Merge branch 'feat/multi-account-switcher'
- `f2f7ca1fa` chore: add .worktrees to gitignore
- `9a088fd8f` docs: add TAOR loop migration design doc

## 4. Impact Analysis & Potential Conflicts

Over **200 files** have been modified on both sides since the branches diverged.
Key areas of concern include:

- **Core API & Orchestration:** `packages/core/src/core/geminiChat.ts`,
  `packages/core/src/index.ts`, `packages/core/src/tools/tools.ts`
- **CLI Rendering & UI:** `packages/cli/src/gemini.tsx`,
  `packages/cli/src/ui/AppContainer.tsx`, and components in
  `packages/cli/src/ui/components/`
- **Agent Intelligence (Skills):** Multiple files under `.agent/skills/`
- **Dependencies & Env:** `package.json`, `package-lock.json`, `.gitignore`

## 5. Recommended Merge Strategy

Given the high conflict density, a single `git merge upstream/main` is likely to
be overwhelming.

1. **Step 1: Staged Merge.** Merge upstream changes in smaller batches or by
   functional area if possible.
2. **Step 2: Interactive Rebase.** Alternatively, rebase the local changes onto
   `upstream/main` to resolve conflicts commit-by-commit.
3. **Step 3: Verification.** Extensive testing of the core and UI components
   post-merge.

## 6. Next Steps

- Transition to the `writing-plans` skill to create a step-by-step
  implementation plan for the merge.
