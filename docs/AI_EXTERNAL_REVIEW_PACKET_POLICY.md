# AI External Review Packet Policy

Date: 2026-07-07 JST
Owner preference: Keisuke

## Purpose

This policy applies when a browser-based or external AI reviews LoreRelay but cannot access the user's local filesystem.

The goal is to make every external review reproducible, compact to hand off, and grounded in exact GitHub artifacts rather than chat history or local paths.

## Core rule

External reviewers must receive:

1. one exact code baseline;
2. one exact review packet;
3. one narrow role and task;
4. one output document path;
5. one closed verdict set.

Do not ask an external AI to reconstruct the task from old chats, local worktrees, README-only guesses, or current HEAD.

## Source hierarchy

For external review work:

1. exact GitHub code commit;
2. exact GitHub review packet branch/ref;
3. packet manifest and attached input documents;
4. current `main` only when the packet explicitly says to use it;
5. chat text only for compact orchestration.

Local paths such as `C:\AI\text-adventure-vsce` must never be used as review inputs for browser-only AIs.

## Review packet branch

Use a temporary branch when review inputs are not yet on `main`.

Naming:

```text
review/<topic>
```

Examples:

```text
review/gameplay-slice1
review/runtime003a-final-audit
```

The packet branch exists to expose review inputs. It is not an implementation branch.

## Packet location

Each review packet lives under:

```text
docs/ai-review-packets/<packet-id>/
```

Minimum contents:

```text
README.md                       # manifest / task contract
INPUT-*.md                      # authoritative review inputs
REVIEW-*.md                     # reviewer outputs
```

The manifest must record:

- Project / repository
- Exact code baseline commit
- Review packet branch/ref
- Reviewer role
- Exact input documents
- One concise task
- Hard constraints
- Output path
- Closed final verdict set

## Immutability rule

A reviewer must not modify authoritative input documents.

The reviewer may only:

- read packet inputs;
- inspect source code at the exact baseline;
- create or update the assigned review output document.

If an input needs repair, create a new input revision or a new packet. Do not silently rewrite history inside the same review.

## No ambiguous refs

Never say only:

```text
read GitHub main
```

when the review depends on a specific state.

Prefer:

```text
Code baseline:
<full commit SHA>

Review packet:
review/<topic>
```

Do not let the reviewer choose current HEAD.

## Packaging rule

If an important audit, design, or review exists only locally or in chat, package it into GitHub before asking another external AI to review it.

Do not paste a long prompt to compensate for missing durable artifacts unless GitHub access is impossible.

## Compact browser-AI prompt

Once the packet exists, the handoff prompt should normally contain only:

```text
AI / Role
Repository
Exact code baseline
Exact review packet branch
Read: packet manifest
Task: follow the manifest exactly
Output path
Final verdict set
```

Detailed attacks, acceptance criteria, and known findings belong in the packet documents.

## Review completion

After an external review:

1. commit the review output to the packet branch or designated task branch;
2. verify the commit in GitHub;
3. record the verdict in the central control artifacts when lifecycle state changes;
4. do not mark an implementation task DONE until merge and post-merge smoke pass.

## Anti-patterns

Reject these handoff patterns:

- local filesystem paths for browser-only AIs;
- `current main` without an exact baseline when state matters;
- asking the reviewer to search old chats for the task;
- mixing implementation and review in one packet;
- rewriting source inputs during review;
- giant inline prompts duplicating durable GitHub documents;
- claiming Drive or GitHub updates that were not actually made.
