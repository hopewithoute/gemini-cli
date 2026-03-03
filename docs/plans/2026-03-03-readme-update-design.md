# Design Doc: README.md Updates for Recent Features

**Status:** Completed **Date:** 2026-03-03 **Authors:** Gemini CLI

## Overview

This document outlines the recent changes made to the `README.md` to highlight
significant new features merged into the project over the last few pull
requests.

## Changes Implemented

We added a new "🎉 What's New" section immediately following the intro and prior
to the "🚀 Why Gemini CLI?" pitch.

This section contains a brief list of the newly introduced features and directly
links to their corresponding documentation or design documents:

- **Multi-Account Switcher:** Links to
  `docs/plans/2026-03-02-multi-account-switcher.md`
- **Custom Status Line & Quota Display:** Links to
  `docs/cli/custom-statusline.md`
- **Meta-Tools System:** Links to `docs/plans/2026-03-03-meta-tools-design.md`

## Rationale

- **Placement:** Placed at the very top (after the banner image) so returning
  users immediately see the new value. It ensures they don't have to scroll down
  to discover major architectural or usability upgrades.
- **Format:** A bulleted list with bold titles and inline links keeps it
  scannable, clean, and prevents cluttering the core README layout.
