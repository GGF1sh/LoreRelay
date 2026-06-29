# Claude Review Files Index

Claude レビュー時に読むべきファイルのインデックス（v1.7.3 更新）。

## 必読

1. `AI_HANDOVER.md`
2. `CHANGELOG.md` — 最新 `[1.7.3]` と `[Unreleased]`
3. `AI_ROADMAP.md`

## コア実装

| 領域 | ファイル |
|------|----------|
| State / Turn | `src/statePatch.ts`, `src/gameStateSync.ts`, `src/turnResultFallback.ts` |
| GM Bridge | `src/gmBridgeRunner.ts`, `src/gmPromptBuilder.ts` |
| World | `src/worldForge.ts`, `src/emergentSimulator.ts`, `src/worldMapGenerator.ts` |
| Cartography | `src/cartographyRunner.ts`, `src/cartographyPathCore.ts` |
| Remote Play | `src/remotePlayServer.ts` |
| Webview | `src/webviewHandlers.ts`, `webview/modules/00-core.js`, `webview/modules/85-world.js` |

## テスト

- `scripts/test_state_patch.js`
- `scripts/test_cartography_path_core.js`
- `scripts/test_remote_play_server.js`
- `npm test` 全体

## 外部レビュー文書

- `C:\AI\CLAUDE_REVIEW.md`
- `C:\AI\GROK_CODE_REVIEW.md`