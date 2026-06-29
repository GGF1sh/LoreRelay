# LoreRelay - Development Timeline

このドキュメントは、LoreRelay（旧 Text Adventure Engine）の開発履歴の要約です。詳細は [`CHANGELOG.md`](CHANGELOG.md) が正本です。

> **注:** 2026-06-24〜25 の「2 日間で構築」という記述は初期ブートストラップ期間を指します。v1.7.3 時点では Phase 1〜7 が完了しています。

---

## Timeline (JST)

### Day 1: 2026-06-24 (v0.1.0 - v0.2.1)

**コアエンジンの構築とマルチ LLM 対応**

- VSCode 拡張の基盤（Webview 双方向通信、`game_state.json` 監視）— v0.1.0
- Glassmorphism UI、CRPG ステータス、画像ギャラリー、ダイス計算機
- ChatGPT / Grok レビューによる CSP・XSS・シェル注入対策 — v0.1.1 - v0.1.2
- Grok Build、Ollama、KoboldCPP ブリッジ — v0.1.9 - v0.2.0
- 4 言語 i18n（ja / en / zh-CN / zh-TW）— v0.2.1

### Day 2: 2026-06-25 (v0.2.2 - v0.2.9)

**CRPG 体験の高度化とモダン UI**

- 隠しダイス、自動 BGM クロスフェード、ローカル SFX — v0.2.2
- SillyTavern キャラカード / Lorebook インポート — v0.2.3
- Memory Bank（TF-IDF）、Saga Archiver — v0.2.5 - v0.2.6
- Undo/Retry、STT、TTS — v0.2.8 - v0.2.9

### Day 3: 2026-06-26 (v0.2.10 - v0.3.x)

**リブランドとオープンソース公開**

- 「Text Adventure Engine」→「LoreRelay」リネーム
- 多言語 README、GitHub 公開
- SillyTavern 参考 UI（Quick Reply、Message Action Bar）— v0.3.0
- Persist-Before-Narrate（`turn_result.json`）— v0.3.2 以降

### Day 4-5: 2026-06-27 - 06-28 (v1.2.0 - v1.3.2)

**World System**

- World Forge / World State / Emergent Simulator / NPC Registry
- Mermaid 世界マップ、World タブ
- World Forge Generator（決定論的生成）
- Living World Feedback（v1.4.x）、Visual Memory / Soulgaze（v1.5.x）

### Day 6-7: 2026-06-28 - 06-29 (v1.6.x - v1.7.3)

**Audit Wave & Cartography**

- v1.6.x: 7 トラック硬化ウェーブ（Remote Play 再監査含む）
- v1.7.0: Cartography UI（Diagram / Parchment、ComfyUI）
- v1.7.1 - v1.7.3: パス検証、ChatGPT/Claude レビュー対応

---

## 次のマイルストーン

- **Phase 8:** Event-to-Quest（`AI_ROADMAP.md`）
- **公開 polish:** README 実スクショ/GIF（`docs/readme-screenshots-plan.md`）

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-26 | 初版（Antigravity） |
| 2026-06-29 | UTF-8 全面書き直し、v1.7.3 まで追記 |