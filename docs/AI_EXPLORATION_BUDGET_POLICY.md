# AI Exploration Budget Policy

Date: 2026-07-07 JST
Owner preference: Keisuke

## Purpose

Narrow LoreRelay tasks must not expand into open-ended repository exploration.

## Default budgets

### Small repair / focused verify

- target: at most 15k reasoning/context tokens;
- no subagent or exploration agent;
- read only named documents and the smallest exact code touch set;
- normally at most 8 source files.

### UX gate / implementation gate / narrow architecture task

- target: at most 30k reasoning/context tokens;
- no broad repository scan;
- no subagent or exploration agent by default;
- start from named documents, then inspect only code needed to resolve exact open questions;
- normally at most 15 source files.

### Repo-wide audit / cross-system architecture

Larger exploration is allowed only when the prompt explicitly identifies a repo-wide task.

A subagent may be used only for a named bounded question. Do not launch an open-ended exploration agent.

## Mandatory stop rule

If the task is likely to exceed its tier:

1. stop broadening exploration;
2. write what has been verified;
3. list the exact remaining unknowns;
4. return `BLOCKED_BY_EXPLORATION_BUDGET` or request a larger budget.

A narrow gate, repair, or verification task must not silently consume an extreme context budget.

## Default prompt clause

For narrow gates:

> Exploration budget: narrow. Do not use subagents or broad repo exploration. Read only the listed documents and the minimum exact code needed. Target <=30k tokens. If that is insufficient, stop and report the exact unknowns instead of expanding scope.

For small repairs and verifies, use a 15k target instead.
