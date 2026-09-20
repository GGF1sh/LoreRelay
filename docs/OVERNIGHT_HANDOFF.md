# Overnight handoff — Living World + LLM strategy

> For 圭佑さん waking up, and for Antigravity / Claude Code / local LLM agents.

## What ran while you slept (Grok)

1. **`C:\AI\lorerelay-world-kit`** v0.1.0 — full Commerce/Transport/Agency cores + tests.
2. **LoreRelay v1.22.0** — LW-W1 initial wire (sim tick, GM prompt, game_rules, turn_result ops).
3. **`AGENTS.md`** — safety rules (no destructive git/shell, small diffs, run tests).

## ChatGPT advice (summary)

| Role | Tool |
|------|------|
| 設計・仕様 | ChatGPT / Claude / Gemini（強いモデル） |
| 実装・ターミナル | Antigravity / Codex / Claude Code |
| ローカル補助 | **Qwen2.5-Coder-14B Q4_K_M**（コード本命）、Qwythos-9B Q5（創作・雑談） |
| 監視 | 人間 + Git。完全放置は危険。 |

**4070 SUPER 12GB:** ローカルは補助脳。世界シミュの「じっくり」設計はクラウド LLM、実装の下書きは Coder 14B。

## Safe overnight tasks (next)

- [ ] `sample-scenarios/trade-routes` with `world_forge.commerce` block
- [ ] World tab price table (read-only)
- [ ] `tradeOps` in Agentic GM schema hint
- [ ] Since-last-visit snapshot on location leave (not just turn stamp)
- [ ] `npm test` after any agent edit

## 🆕 Opus 4.8 が用意した「ガッツリ仕様書」（2026-07-02 深夜）

**寝ている間の実装は下の2つを読ませれば回る:**

- **`docs/LIVING_WORLD_IMPLEMENTATION_SPEC.md`** — LW1-PR2 / PR3 / LW2-PR1 / LW-DEMO の確定仕様。
  現状 API 一覧・データ契約・受け入れ条件・DoD・迷ったときの既定回答（§6）付き。
- **`docs/AGENT_PROMPTS_LIVING_WORLD.md`** — Antigravity 監督ヘッダー + TASK 1〜5 のコピペ投入プロンプト +
  ローカル Coder 向けサブタスク + 起床時チェックリスト。上から順に投げるだけ。

**🔴 実装前に知るべき検証済みバグ（SPEC §1）:** `livingWorldBridge.ts:buildLivingWorldGmLines()` の
Since-last-visit が `marketsBefore === marketsAfter`（同一参照）で差分が常にゼロ。`recordLocationVisit()`
がターン番号しか保存していないのが根因。**TASK 1 で最優先修正**（`marketSnapshotByLocation` を追加）。

**投げ順:** TASK 1（バグ修正・小）→ TASK 2（相場表 UI）→ TASK 3（NPC 可視化）→ TASK 4（Transport×Layer B）→ TASK 5（デモ）。

## Unsafe overnight (do NOT)

- File deletes, `git clean`, schema migrations without backup
- Full economy sim / 100 NPCs
- Auth, billing, dependency bulk adds

## Enable Living World in a workspace

1. `game_rules.json`: `enableWorldForge`, `enableEmergentSimulation`, `enableCommerce` (and optionally `enableNpcRegistry` + `enableNpcAgency`).
2. Add `commerce` block to `world_forge.json` (see `lorerelay-world-kit/fixtures/trade_routes_forge.json`).
3. Play GM turns — markets tick on sim steps; GM prompt shows `[Living World — Markets]` when ON.

## Sync world-kit after edits

```bash
node scripts/sync_world_kit.js
npm run compile
npm test
```