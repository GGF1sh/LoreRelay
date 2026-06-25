# LoreRelay - Local-first AI Game Master UI 🎲

[English](README_en.md) | [日本語](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Local-first AI Game Master UI**

这是一个 VSCode 扩展，让您使用现有的 AI 订阅（ChatGPT Plus, Claude Pro, Gemini Advanced 等）或本地 LLM（Ollama / KoboldCPP）在丰富的 UI 中游玩文字冒险游戏。
如果您使用可以在本地执行的代理 AI（如 Antigravity），游戏状态将自动反映。如果您使用标准的网页版 AI，只需手动复制粘贴生成的状态（JSON）即可轻松游玩。
**基本上不需要额外的按量计费 API 密钥。** Ollama / KoboldCPP / Grok CLI 可以在本地或现有的订阅中运行，而 **OpenRouter 可以作为任意云端连接使用**（需要设置 API 密钥）。

这不是一个封闭的 AI RPG 服务。它是一个**完全开放且可改造的“Hacker Edition” UI 层**，供您结合自己的 AI 助手、本地图像生成、音源和剧本来游玩。您可以自由地在自己的环境中进行 Hack，打造出像 Saga & Seeker 那样硬核的 CRPG 体验。

> 💡 **Notice:** 如果您喜欢这个扩展，请考虑请我喝杯咖啡！☕ (https://ko-fi.com/promptpalette)

---

## 🌟 Features

- 💸 **No Extra API Costs (by default):** 本地 LLM、Grok CLI 或手动复制粘贴操作无需按量计费的 API 密钥。仅在使用 OpenRouter 时需要 API 密钥。
- 🧩 **Agent Bridge:** 如果使用 Grok Build 等可在本地执行的 AI，您可以直接将 Webview 的选项和自由输入发送给 GM。
- 🎨 **Glassmorphism UI:** 包含半透明聊天 UI、世界观主题切换和图像画廊的丰富显示界面。
- ⚔️ **CRPG Character Sheet:** 受 Saga & Seeker 等启发的视觉状态面板，可管理 HP/MP 进度条、技能和物品栏。
- 🖼️ **Local Image Generation:** 与 ComfyUI 配合，在本地即时生成并显示 AI 描绘的场景画面。
- 🎵 **Adaptive BGM & SFX:** 根据 GM 的指示，自动控制并交叉淡入淡出在 `bgm.json` / `sfx.json` 中注册的音源。
- 📦 **Scenario Packs:** 只需加载包含 `scenario.json` 的文件夹，即可一次性应用初始场景、主题和专用 BGM/音效。
- 🎲 **Built-in Dice Roller & Calculator:** 内置 TRPG 判定必不可少的掷骰子（NdX）和数学计算器。
- 💾 **Persistent Adventure Log:** 将冒险日志保存到 `game_history.json`，即使重启 VSCode 也能恢复历史记录。

---

## 📸 Screenshots & Demo

<!-- 
💡 开发者提示：
在发布之前，请在此处放置传达以下元素的屏幕截图（或演示 GIF）：
1. 类似 CRPG 的角色卡（HP/MP 条，技能徽章）
2. 拟物化毛玻璃风格的聊天 UI 和掷骰子器
3. 通过 ComfyUI 在本地自动生成的精美场景图像库
-->

*(Screenshot placeholder - please add media here before release)*

---

## 🚀 How to Play

该扩展使用松散耦合机制，监听 AI 导出的 `game_state.json` 并渲染 UI。根据您的环境，有两种游玩方式。

### Mode A: 自动同步模式 (Recommended)
**适用对象：** 使用**可写入本地文件的代理 AI**（如 Antigravity, Grok CLI, VSCode Copilot (Cursor)）的用户。

1. 让 AI 读取包含的 `SKILL.md`，并指示“按照此技能开始担任游戏主持（GM）”。
2. 之后，您只需与 AI 聊天即可。AI 会自动掷骰子、使用 ComfyUI 生成图像并更新 `game_state.json`。
3. 在 VSCode 中保持此扩展打开，UI 将实时更新！

> **对于 Antigravity 用户：** 您可以轻松操作：点击 Webview 中的选项 → 复制到剪贴板 → 粘贴到 Antigravity 聊天中 → 自动更新。详情请参阅 [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md)。

### Mode B: 手动复制粘贴模式
**适用对象：** 使用标准网页版 ChatGPT, Claude, 或 Gemini 的用户。

1. 将 `SKILL.md` 的文本复制并粘贴到网页版 AI 中，并说：“请按照这些指示担任 GM。”
2. 复制 AI 返回的 JSON 代码块，并手动在 VSCode 中覆盖保存 `game_state.json`。
3. 保存的瞬间，VSCode UI 会自动切换。（图像生成和掷骰子需手动执行，或使用网页版 AI 的功能代替）。

---

## 🛠️ Setup & Installation

### 1. Prerequisites
- **VSCode** (v1.85+)
- **Python** (执行图像生成和掷骰子脚本所需)
- **ComfyUI** (用于本地图像生成。必须在 API 模式下启动)

### 2. Quick setup (recommended)

将 `TextAdventureGMSkill` 放在 `text-adventure-vsce` 旁边（例如：在 `C:\AI\` 目录下）：

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

脚本将执行：
- 自动检测 GM 技能路径 → 生成 `my-adventure/.vscode/settings.json`
- `npm install` / `compile` / `test`
- (可选) VSIX 打包 → `code --install-extension`
- 生成 `text-adventure.code-workspace`（3 个根目录：Game + Skill + Extension）

选项示例：`-Locale en` `-GmProvider clipboard` `-SkipVsix`

### 3. Manual extension installation
1. 克隆或下载此代码库。
2. 在 VSCode 中打开文件夹，并在终端中运行 `npm install`。
3. 按 `F5` 键开始调试扩展，或使用 `npx @vscode/vsce package` 安装 VSIX。
4. 从命令面板 (`Ctrl+Shift+P`) 运行 `Text Adventure: Open Game UI` 以打开面板。

### 4. Configuration
在 VSCode 设置中搜索 `textAdventure.skillPath`，并指定随附的 `comfyui_generate.py` 脚本的绝对路径。

主要设置：

- `textAdventure.skillPath` — `comfyui_generate.py` 的绝对路径
- `textAdventure.locale` — UI / 错误 / GM 提示的语言（`ja` / `en` / `zh-CN` / `zh-TW`）。也可以从 Webview 标题栏的 🌐 更改。
- `textAdventure.gmBridge.provider` — `grok` / `ollama` / `koboldcpp` / `clipboard` / `command` (详情见 `GM_BRIDGE_PRESETS.md`)
- `textAdventure.grokBridge.*` — 启用 Grok Build 自动发送、CLI 路径、后备设置
- `textAdventure.imageGen.*` — ComfyUI / Stability Matrix URL, checkpoint, workflow, 生成大小
- `textAdventure.bgm.*` — BGM 配置文件和音量
- `textAdventure.sfx.*` — SFX 配置文件和音量

### 5. Scenario Packs
从命令面板运行 `Text Adventure: Load Scenario Pack` 并选择包含 `scenario.json` 的文件夹，以一次性加载初始状态、主题和专用的 BGM/SFX。

可以在 GM 技能端的 `TextAdventureGMSkill/scenarios/lost-catacombs/` 中找到示例。

---

## 🗺️ Roadmap

- **Remote Play Mode:** 我们正在考虑一种模式：将您的家用电脑用作 GM 服务器，通过 LAN 或 Tailscale 从智能手机浏览器进行游玩。初始范围将限制为显示 `game_state.json`、发送玩家动作以及查看生成的图像。不打算直接暴露在互联网中。

---

## 🤝 Contributing & Support
该项目是一个实验性的 OSS，旨在成为 AI 时代的“文字冒险新游乐场”。
非常欢迎提交错误报告和请求（PR）！

如果这个项目让您感到兴奋......
👉 **[Buy me a coffee ☕](https://ko-fi.com/promptpalette)**

---
**Enjoy your adventure!**
