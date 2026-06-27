# LoreRelay - Local-first AI Game Master UI 🎲

[English](README_en.md) | [日本語](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Local-first AI Game Master UI**

**Antigravity (免費) × LoreRelay × ComfyUI —— 由前沿大模型擔任 GM 的全自動 RPG 環境，無需 API 金鑰，零額外成本。**

這是一個最大化利用您現有 AI 訂閱的 VSCode 擴充套件，它結合了像 SillyTavern 一樣的後端自由度，以及像 Saga & Seeker 一樣硬核的 CRPG 體驗。
透過手動複製貼上（或透過本地代理自動執行）傳遞 JSON，它提供了一個完全開放且可改造的「Hacker Edition」 UI 層，讓您可以自由地在自己的環境中進行 Hack。

> 💡 **Notice:** 如果您喜歡這個擴充套件，請考慮請我喝杯咖啡！☕ (https://ko-fi.com/promptpalette)

---

## 🌟 Features

- 💸 **No Extra API Costs (by default):** 本機 LLM、Grok CLI 或手動複製貼上操作無需按量計費的 API 金鑰。僅在使用 OpenRouter 時需要 API 金鑰。
- 🧩 **Agent Bridge:** 如果使用 Grok Build 等可在本機執行的 AI，您可以直接將 Webview 的選項和自由輸入發送給 GM。
- 🎨 **Glassmorphism UI:** 包含半透明聊天 UI、世界觀主題切換和圖像畫廊的豐富顯示介面。
- ⚔️ **CRPG Character Sheet:** 受 Saga & Seeker 等啟發的視覺狀態面板，可管理 HP/MP 進度條、技能和物品欄。
- 🖼️ **Local Image Generation:** 與 ComfyUI 配合，在本機即時生成並顯示 AI 描繪的場景畫面。
- 🎵 **Adaptive BGM & SFX:** 根據 GM 的指示，自動控制並交叉淡入淡出在 `bgm.json` / `sfx.json` 中註冊的音源。
- 📦 **Scenario Packs:** 只需載入包含 `scenario.json` 的資料夾，即可一次性套用初始場景、主題和專用的 BGM/音效。
- 🎲 **Built-in Dice Roller & Calculator:** 內建 TRPG 判定必不可少的擲骰子（NdX）和數學計算器。
- 💾 **Persistent Adventure Log:** 將冒險日誌儲存到 `game_history.json`，即使重啟 VSCode 也能恢復歷史紀錄。
- 🔍 **Turn Inspector:** 每回合骰子台帳、狀態修補、觸發 lore 可視化。
- 📖 **Lorebook & Memory UI:** ST 相容 lorebook 編輯、記憶搜尋預覽、釘選 lore 注入。
- 🎬 **Scenario & Party Director:** `scenario.json` / `party_director.json` 與 `game_state` 執行時聯動。
- 📱 **Remote Play:** LAN 加入 QR、玩家 / 觀戰角色。

---

## 📸 Screenshots & Demo

<p align="center">
  <img src="docs/assets/hero-ui.svg" alt="LoreRelay main UI" width="720" />
</p>

| Inspector | Remote Play | Party Director |
|:---:|:---:|:---:|
| <img src="docs/assets/screenshot-inspector.svg" width="240" alt="Turn Inspector" /> | <img src="docs/assets/screenshot-remote-play.svg" width="240" alt="Remote Play" /> | <img src="docs/assets/screenshot-party-director.svg" width="240" alt="Party Director" /> |

| Lorebook | ComfyUI |
|:---:|:---:|
| <img src="docs/assets/screenshot-lorebook.svg" width="360" alt="Lorebook editor" /> | <img src="docs/assets/screenshot-comfyui.svg" width="360" alt="ComfyUI scene generation" /> |

替換為真實截圖或 GIF 的步驟見 [`DEMO.md`](DEMO.md)。

---

## 🚀 How to Play

該擴充套件使用鬆散耦合機制，監聽 AI 匯出的 `game_state.json` 並渲染 UI。根據您的環境，有兩種遊玩方式。

### Mode A: 自動同步模式 (Recommended)
**適用對象：** 使用**可寫入本機檔案的代理 AI**（如 Antigravity, Grok CLI, VSCode Copilot (Cursor)）的使用者。

1. 讓 AI 讀取包含的 `SKILL.md`，並指示「按照此技能開始擔任遊戲主持（GM）」。
2. 之後，您只需與 AI 聊天即可。AI 會自動擲骰子、使用 ComfyUI 生成圖像並更新 `game_state.json`。
3. 在 VSCode 中保持此擴充套件打開，UI 將即時更新！

> **對於 Antigravity 使用者：** 您可以輕鬆操作：點擊 Webview 中的選項 → 複製到剪貼簿 → 貼上到 Antigravity 聊天中 → 自動更新。詳情請參閱 [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md)。

### Mode B: 手動複製貼上模式
**適用對象：** 使用標準網頁版 ChatGPT, Claude, 或 Gemini 的使用者。

1. 將 `SKILL.md` 的文字複製並貼上到網頁版 AI 中，並說：「請按照這些指示擔任 GM。」
2. 複製 AI 返回的 JSON 程式碼區塊，並手動在 VSCode 中覆寫儲存 `game_state.json`。
3. 儲存的瞬間，VSCode UI 會自動切換。（圖像生成和擲骰子需手動執行，或使用網頁版 AI 的功能代替）。

---

## 🛠️ Setup & Installation

### 1. Prerequisites
- **VSCode** (v1.85+)
- **Python** (執行圖像生成和擲骰子腳本所需)
- **ComfyUI** (用於本機圖像生成。必須在 API 模式下啟動)

### 2. Quick setup (recommended)

將 `TextAdventureGMSkill` 放在 `text-adventure-vsce` 旁邊（例如：在 `C:\AI\` 目錄下）：

**Windows (PowerShell):**
```powershell
cd text-adventure-vsce
.\scripts\setup.ps1
```

**macOS / Linux:**
```bash
cd text-adventure-vsce
chmod +x scripts/setup.sh
./scripts/setup.sh
```

腳本將執行：
- 自動檢測 GM 技能路徑 → 生成 `my-adventure/.vscode/settings.json`
- `npm install` / `compile` / `test`
- (可選) VSIX 打包 → `code --install-extension`
- 生成 `text-adventure.code-workspace`（3 個根目錄：Game + Skill + Extension）

選項範例：`-Locale en` `-GmProvider clipboard` `-SkipVsix`

### 3. Manual extension installation
1. 複製（Clone）或下載此程式庫。
2. 在 VSCode 中打開資料夾，並在終端機中運行 `npm install`。
3. 按 `F5` 鍵開始偵錯擴充套件，或使用 `npx @vscode/vsce package` 安裝 VSIX。
4. 從命令面板 (`Ctrl+Shift+P`) 運行 `Text Adventure: Open Game UI` 以打開面板。

### 4. Configuration
在 VSCode 設定中搜尋 `textAdventure.skillPath`，並指定隨附的 `comfyui_generate.py` 腳本的絕對路徑。

主要設定：

- `textAdventure.skillPath` — `comfyui_generate.py` 的絕對路徑
- `textAdventure.locale` — UI / 錯誤 / GM 提示的語言（`ja` / `en` / `zh-CN` / `zh-TW`）。也可以從 Webview 標題列的 🌐 更改。
- `textAdventure.gmBridge.provider` — `grok` / `ollama` / `koboldcpp` / `clipboard` / `command` (詳情見 `GM_BRIDGE_PRESETS.md`)
- `textAdventure.grokBridge.*` — 啟用 Grok Build 自動發送、CLI 路徑、後備設定
- `textAdventure.imageGen.*` — ComfyUI / Stability Matrix URL, checkpoint, workflow, 生成大小
- `textAdventure.bgm.*` — BGM 設定檔和音量
- `textAdventure.sfx.*` — SFX 設定檔和音量

### 5. Scenario Packs
從命令面板執行 `LoreRelay: Load Scenario Pack` 並選擇包含 `scenario.json` 的資料夾。

**同捆範例（3 本）** — `sample-scenarios/`：

| 資料夾 | 類型 | 主題 |
|--------|------|------|
| `lost-catacombs` | 經典地牢探索 | fantasy |
| `neon-rain` | 賽博龐克黑色電影 | cyberpunk |
| `harbor-mist` | 港口懸疑 | modern |

GM 技能端：`TextAdventureGMSkill/scenarios/`。

### 6. 模型與 ComfyUI 預設 (v1.0)
- [`MODEL_PRESETS.md`](MODEL_PRESETS.md) — 從 `presets/` 複製 JSON
- [`COMFYUI_WORKFLOWS.md`](COMFYUI_WORKFLOWS.md) — `comfyui/` 內工作流程

---

## 🗺️ Roadmap

v1.0 核心功能（Inspector、Lorebook/Memory、Director、Party Director、Remote Play）已發布。後續可能加強 Workshop 分發與 VLM 整合。

---

## 🤝 Contributing & Support
該專案是一個實驗性的 OSS，旨在成為 AI 時代的「文字冒險新遊樂場」。
非常歡迎提交錯誤報告和請求（PR）！

如果這個專案讓您感到興奮......
👉 **[Buy me a coffee ☕](https://ko-fi.com/promptpalette)**

---
**Enjoy your adventure!**
