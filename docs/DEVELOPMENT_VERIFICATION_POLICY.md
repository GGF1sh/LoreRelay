# LoreRelay Development and Verification Policy

## Purpose

LoreRelay development exists to deliver a playable and enjoyable experience.

Tests, reviews, reports, worktrees, and development tools support that goal. They must not become the goal themselves.

## Priority Order

Work in this order:

1. Problems currently blocking human play
2. Problems discovered during actual play
3. Player-facing usability and clarity
4. Functional improvements
5. Developer tooling
6. Non-blocking hardening and hypothetical future issues

## Human Play Gate

When `main` is playable, human play is the next task.

Do not delay play for:

- additional “just in case” review;
- repeated verification of already confirmed facts;
- non-blocking hardening;
- new developer tooling;
- additional reports;
- hypothetical problems not observed in real use.

No new tooling or non-blocking hardening may begin until the playable build has been tried by the user.

## Verification Tiers

### Low Risk

Examples:

- documentation;
- wording and localization;
- comments;
- colors, spacing, and simple CSS;
- display-only changes without state or authority effects.

Required:

- relevant focused check or visual confirmation;
- build only when needed.

Do not require independent review, a full suite, or a durable audit report.

### Medium Risk

Examples:

- player-blocking UI behavior;
- normal feature additions;
- limited UI/host integration;
- single-subsystem logic changes;
- reversible state behavior without schema migration.

Required:

- relevant focused tests;
- compile when applicable;
- a short human smoke check;
- at most one additional reviewer when there is a concrete reason.

A full suite is normally deferred to the final integration or release tree.

### High Risk

Examples:

- shell, process, or command execution;
- deletion, overwrite, installer, or updater behavior;
- save data, migration, restore, or canonical authority;
- authentication, networking, or remote access;
- concurrent writes, atomicity, and irreversible state changes;
- security boundaries.

Required:

- focused tests;
- one independent review or adversarial verification;
- one repair pass when needed;
- one verification of that repair;
- one full suite on the final executable tree.

Do not perform “verification of the repair verification” or ask a third AI to reconfirm the same fact.

## Test Rules

- Run the full suite at most once per unchanged executable tree.
- Never run the full suite for documentation-only commits.
- Prefer Test Console focused tests during development.
- A rerun requires changed executable code, a new concrete risk, a previous failure, or missing evidence.
- Different AIs must not repeat the same suite merely to produce independent-looking evidence.
- Unknown or poorly classified changes may be escalated, but the reason must be stated before broader testing begins.

## AI and Review Limits

- Use one AI for normal tasks.
- Use at most two AIs for medium- or high-risk tasks.
- Do not automatically split implementation, verification, and integration into separate chats.
- Verify an AI report through the commit, diff, and concise evidence—not by blindly repeating all work.
- Do not ask a third AI to check a fact already independently verified.
- Previously verified evidence remains valid until executable code or the relevant risk changes.

## Reporting

Normal task reports contain only:

- what changed;
- what was checked;
- the result;
- remaining known issues.

Long durable reports are reserved for security incidents, migrations, destructive operations, and other genuinely high-risk changes.

A report must not create a new requirement to test the report.

## Stop Conditions

Stop and reassess when:

- verification work exceeds implementation work for a Low or Medium task;
- the same test is about to run twice on the same tree;
- a third party is about to reconfirm the same evidence;
- checks are increasing without producing new information;
- play is being delayed by non-blocking work;
- a support tool becomes larger than the problem it was meant to solve.

“Just in case” is not sufficient justification after adequate evidence exists.

## Required Instruction for AI Tasks

Include this line in future LoreRelay task handoffs:

> Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`. Do not escalate beyond its risk tier without a concrete reason.

## Core Rule

**Test enough to reveal meaningful failures, then stop and play.**
