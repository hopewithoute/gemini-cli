# Persistent Quota Info in Footer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Add a persistent second line to the status line (footer) showing the
remaining model usage percentage.

**Architecture:**

1. Update `QuotaDisplay` component to support persistent visibility and a simple
   format (no `/stats` prefix).
2. Update `Footer` component to use `flexDirection="column"` and add a new row
   for the quota information.
3. Update relevant tests to ensure visual and functional correctness.

**Tech Stack:** React (Ink), TypeScript, Vitest.

---

### Task 1: Update QuotaDisplay Props and Logic

**Files:**

- Modify: `packages/cli/src/ui/components/QuotaDisplay.tsx`

**Step 1: Update the component**

Modify `packages/cli/src/ui/components/QuotaDisplay.tsx`:

- Add `showAlways?: boolean` and `showCommandPrefix?: boolean` (default `true`)
  to `QuotaDisplayProps`.
- Update the logic to skip the percentage threshold check if `showAlways` is
  true.
- Update the rendering to conditionally show the `/stats ` prefix based on
  `showCommandPrefix`.

**Step 2: Commit**

```bash
git add packages/cli/src/ui/components/QuotaDisplay.tsx
git commit -m "feat: add showAlways and showCommandPrefix props to QuotaDisplay"
```

---

### Task 2: Update QuotaDisplay Tests

**Files:**

- Modify: `packages/cli/src/ui/components/QuotaDisplay.test.tsx`

**Step 1: Add new test cases**

Add tests for:

- `showAlways={true}` (should render even if percentage > 20%).
- `showCommandPrefix={false}` (should NOT render "/stats ").

**Step 2: Run tests**

Run: `npm test packages/cli/src/ui/components/QuotaDisplay.test.tsx` Expected:
All tests PASS.

**Step 3: Commit**

```bash
git add packages/cli/src/ui/components/QuotaDisplay.test.tsx
git commit -m "test: add test cases for new QuotaDisplay props"
```

---

### Task 3: Update Footer Layout

**Files:**

- Modify: `packages/cli/src/ui/components/Footer.tsx`

**Step 1: Wrap footer content in a column Box**

Modify `packages/cli/src/ui/components/Footer.tsx`:

- Change the main `Box` to `flexDirection="column"`.
- Wrap the existing row in a child `Box`.
- Add a second row (Box) that renders `QuotaDisplay` if `quotaStats` is
  available, with `showAlways={true}` and `showCommandPrefix={false}`.

**Step 2: Commit**

```bash
git add packages/cli/src/ui/components/Footer.tsx
git commit -m "feat: add persistent quota info as a second line in Footer"
```

---

### Task 4: Update Footer Tests and Snapshots

**Files:**

- Modify: `packages/cli/src/ui/components/Footer.test.tsx`

**Step 1: Run tests and update snapshots**

Run: `npm test packages/cli/src/ui/components/Footer.test.tsx` If snapshots fail
due to layout changes, review them and update if correct.

**Step 2: Commit**

```bash
git add packages/cli/src/ui/components/Footer.test.tsx
git commit -m "test: update Footer snapshots for new layout"
```
