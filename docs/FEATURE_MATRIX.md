# Feature Matrix — Stable vs Experimental

> **正本:** `package.json` + [`VERSION_TRUTH.md`](VERSION_TRUTH.md) + `src/gameRules.ts` の `DEFAULT_GAME_RULES`  
> 初見向け。詳細履歴は [`CHANGELOG.md`](../CHANGELOG.md)。

| Feature | Default (`game_rules`) | Status | Notes |
|---------|------------------------|--------|-------|
| AI GM / GM Bridge | ON (settings) | **stable** | Grok, vscode-lm, Ollama, etc. |
| RPG mechanics (HP/MP) | ON | **stable** | `enableRpgMechanics` |
| World Forge | OFF | **beta** | Needs `world_forge.json` |
| Emergent Simulation | OFF | **beta** | Needs `world_state.json` |
| NPC Registry | OFF | **beta** | Needs `npc_registry.json` |
| Quest Board | with sim | **stable** | Event/NPC hooks |
| Git Timeline / checkpoints | ON | **stable** | Branch / rewind |
| Chronicle (`[Previously]`) | setting | **stable** | `chronicleCore` deterministic |
| Pacing Director | setting | **beta** | Prompt hint |
| Faction Reputation | OFF | **experimental** | `enableFactionReputation` |
| Travel Encounters | OFF | **experimental** | `enableTravelEncounters` |
| Cartography (FoW, map items) | optional | **beta** | ComfyUI optional |
| Replay Export | command | **stable** | Markdown / HTML |
| Remote Play | command | **beta** | LAN; signed media URLs |
| TTS / NPC Voice | setting | **beta** | Phase 11 |
| Agentic GM (2-stage) | OFF | **experimental** | Referee + Narrator |
| **Living World Commerce** | OFF | **experimental** | `enableCommerce` |
| **Commerce UI (Buy/Sell)** | OFF | **experimental** | `enableCommerceUi` |
| **NPC Agency** | OFF | **experimental** | `enableNpcAgency`, ≤10 NPCs |
| Trust-linked whereabouts | with agency | **experimental** | v1.27+ |
| Inspector market debug | debug | **dev only** | Commerce ON + debug console |
| **NPC Bonds (LW3)** | OFF | **experimental** | `enableNpcRelationships` |
| **Player bonds / trade ripple** | with LW3 | **experimental** | v1.32–1.33 · `playerBondCore` |
| **Domain Mode (lordship)** | OFF | **experimental** | v1.39.x + D3 UI (v1.40.0) · `enableDomainMode` |
| **Domain Audience (謁見)** | OFF | **experimental** | v1.40.0 · `enableDomainAudience` · World タブパネル済み |
| **Domain Rivals (隣国ライバル)** | OFF | **experimental** | v1.40.0 · `enableDomainRivals` · World タブパネル済み |
| **Domain Missions (主命・派遣)** | OFF | **experimental** | v1.40.0 · `enableDomainMissions` · World タブパネル済み |
| **Domain Mass Battle (合戦)** | OFF | **experimental** | v1.40.0 · `enableMassBattle` · World タブパネル済み |
| **Guild Master Mode** | OFF | **experimental** | v1.41.0 · `enableGuildMode` · weekly commit + World タブ |
| **Guild Requests (依頼板)** | OFF | **experimental** | v1.42.0 · `enableGuildRequests` · bulk / parley tier |
| **Guild Parties (派遣)** | OFF | **experimental** | v1.43.0 · `enableGuildParties` · Bond 連動クエスト判定 |
| **Guild Absence Drift** | with guild | **experimental** | v1.44.0 · hall 離脱/帰還 · Since-last-visit プロンプト |

## Quick demo paths

| Goal | Path |
|------|------|
| First play | Start Hub → Try demo |
| Living World | [`LIVING_WORLD_QUICKSTART.md`](LIVING_WORLD_QUICKSTART.md) + `sample-scenarios/trade-routes` |
| Map / FoW | Cartography + `lost-catacombs` or generated world |
| Long campaign | Chronicle + Git Timeline + Replay Export |

## Prompt budget (Gemini review note)

Living World + Chronicle + NPC blocks grow GM context. Mitigations today:

- `promptBudget` modes (`compact` / `balanced` / `expanded`)
- Turn Inspector shows budget breakdown
- `scripts/test_prompt_context_budget.js`

Future: priority-based sliding window / vector memory offload (partial eviction in v1.33; full sliding TBD).