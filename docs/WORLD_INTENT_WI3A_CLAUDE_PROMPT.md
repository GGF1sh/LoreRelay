# World Intent WI3a Claude Prompt: Preview UI Design

> Purpose: give Claude a UI/UX-only task for World Intent preview.
> Status: design prompt, not implementation authority.
> Date: 2026-07-04.

## Recommended Model

- Model: Claude Sonnet / Opus if available
- Reasoning: Medium for UI design, High only if it proposes host message contracts

## Copy-Paste Prompt

```markdown
LoreRelay World Intent WI3a Preview UI の設計をお願いします。

推奨モデル: Claude Sonnet
推奨推論: Medium

まず以下を読んでください:
1. C:\AI\text-adventure-vsce\AI_SHARED_LOG.md の Current Snapshot
2. C:\AI\text-adventure-vsce\CHANGELOG.md の [Unreleased]
3. C:\AI\text-adventure-vsce\docs\WORLD_INTENT_CORE_DESIGN.md
4. C:\AI\text-adventure-vsce\docs\WORLD_INTENT_WI2_CHATGPT_GATE.md
5. C:\AI\text-adventure-vsce\docs\WORLD_INTENT_WI3B_CHATGPT_GATE.md
6. C:\AI\text-adventure-vsce\src\worldIntentCore.ts
7. C:\AI\text-adventure-vsce\src\worldIntentVehicleParityCore.ts
8. C:\AI\text-adventure-vsce\webview\modules\89-vehicles.js
9. C:\AI\text-adventure-vsce\webview\modules\89a-vehicle-labels.js
10. C:\AI\text-adventure-vsce\webview\style.css

目的:
Vehicles UI に World Intent の「プレビュー」だけを表示する設計を作ってください。
この段階では実装ではなく、UI/UX設計と実装計画だけで構いません。

厳守:
- Webview から World Intent を実行しない。
- vehicle_state.json / game_state.json / turn_result.json を書かない。
- `executeWorldIntent()` を Webview から直接呼ぶ設計にしない。
- `statePatch.ts` や ledger persist に触る提案は WI3a には含めない。
- WI3a は read-only / preview-only。
- `queryWorldIntent()` 相当の結果を見せる場合も、host read-only query endpoint は別ゲート対象として明記する。

設計してほしいもの:
1. Vehicles tab 内の配置案
   - 車両詳細カード
   - fuel / damage / movement / active vehicle 操作候補
   - valid_noop / blocked / invalid の見せ方
2. UI states
   - preview unavailable
   - allowed
   - valid_noop
   - blocked
   - invalid / unsupported
   - bridge mode off / shadow / compare_only
3. i18n key list
   - ja/en/zh-CN/zh-TW に必要なキー名と文言案
4. Accessibility
   - aria-label
   - aria-live
   - keyboard focus
   - color-only に依存しない status 表示
5. Implementation plan
   - Webview-only static previewで可能な範囲
   - host read-only query endpoint が必要な範囲
   - WI3b bridge diagnostics との違い
6. Non-goals
   - execute/apply button
   - automatic repair/refuel
   - state mutation
   - Remote Play write

出力形式:
- Findings / UX risks table
- Recommended UI layout
- UI state matrix
- Required i18n keys
- Implementation phases
- Risks that must go back to ChatGPT/Codex gate
```

## Codex Note

Claude should own the look and flow, not the authority boundary.

If Claude proposes a Webview-to-host preview endpoint, route it back through a small Codex/ChatGPT gate before implementation. The endpoint may be read-only, but it still crosses the Webview trust boundary.

