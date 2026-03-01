# Design Doc: Persistent Quota Info in Footer

## Overview

Add a new, persistent line at the bottom of the CLI status line (footer) to
display the remaining model usage percentage.

## Current State

- `Footer.tsx` displays model info, CWD, and other details in a single row.
- `QuotaDisplay.tsx` displays quota percentage but only when it falls below 20%.
- It currently prefixes the message with `/stats` when not in `terse` mode.

## Proposed Changes

1. **`QuotaDisplay.tsx`**:
   - Add `showAlways?: boolean` prop to bypass the 20% threshold.
   - Add `showCommandPrefix?: boolean` prop (default `true`) to optionally hide
     the `/stats` prefix.
   - Update tests to cover these new cases.

2. **`Footer.tsx`**:
   - Wrap existing footer content in a `Box` with `flexDirection="column"`.
   - Add a new `Box` at the bottom that renders `QuotaDisplay` when `quotaStats`
     is available.
   - Set `showAlways={true}` and `showCommandPrefix={false}` for this new footer
     instance.

## Testing Strategy

- Unit test updates for `QuotaDisplay`.
- Snapshot test updates for `Footer` to verify the new layout.
