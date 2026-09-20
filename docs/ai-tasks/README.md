# AI Task Index and Archive Policy

`docs/ai-tasks/` is durable task evidence, not a mandatory reading queue. Start from [AI Workflow](../AI_WORKFLOW.md), then open only the task record linked by the active backlog or handoff.

## Where to find work

| Class | Canonical location | How to use it |
| --- | --- | --- |
| Active | [AI Review Backlog](../AI_REVIEW_BACKLOG.md) | Current work whose status is not terminal; reconcile against `origin/main`. |
| Follow-up | [AI Findings Inbox](../AI_FINDINGS_INBOX.md) and backlog dependencies | Triage into a task only when accepted; a finding alone is not a stop condition. |
| Accepted / completed | Terminal entries in the backlog and their linked task records | Read only to confirm a specific prior decision or evidence. |
| Historical evidence | Existing task records in this directory | Preserve them; use targeted filename/ID search rather than a bulk read. |
| Superseded | A record explicitly marked superseded, replaced, or repair-required | Keep it as provenance and follow its replacement record. |

## New and legacy records

- New task records begin with task ID, status, exact base/branch, scope, and final verdict; link the active board rather than repeating long policy text.
- When a task changes state, update the backlog/current handoff, not every related historical note.
- Legacy records without a live backlog link are historical evidence by default. Do not delete or rewrite them merely to reorganize the archive.
- Do not put a bulk list of all task files into normal handoffs. Search by task ID or subsystem when historical detail is needed.
