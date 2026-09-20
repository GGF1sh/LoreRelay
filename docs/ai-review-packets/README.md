# AI Review Packets

This directory contains reproducible cross-AI review packets for LoreRelay.

See:

- `docs/AI_PROMPT_HANDOFF_POLICY.md`
- `docs/AI_EXTERNAL_REVIEW_PACKET_POLICY.md`

## Packet template

Create:

```text
docs/ai-review-packets/<packet-id>/README.md
```

Use this manifest shape:

```markdown
# <Packet Title>

## Project
LoreRelay

## Repository
GGF1sh/LoreRelay

## Exact code baseline
<full commit SHA>

## Review packet ref
review/<topic>

## Reviewer role
<one narrow role>

## Read exactly
- INPUT-1.md
- INPUT-2.md

## Task
<one concise task>

## Hard constraints
- <constraint>
- <constraint>

## Output
REVIEW-<name>.md

## Final verdict
Choose exactly one:
- VERDICT_A
- VERDICT_B
- VERDICT_C
```

## Packet rules

- Inputs are immutable during review.
- Reviewers inspect code at the exact baseline, not current HEAD.
- Browser-only reviewers are never given local filesystem paths.
- Long attack matrices and acceptance criteria belong in packet documents, not chat prompts.
- One packet should answer one review question.
- Implementation changes do not belong on a review packet branch.
