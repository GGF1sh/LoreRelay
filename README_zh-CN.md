# LoreRelay - Local-first AI Game Master UI 軸

[English](README_en.md) | [譌･譛ｬ隱枉(README.md) | [邂菴謎ｸｭ譁Ⅹ(README_zh-CN.md) | [郢・ｫ比ｸｭ譁Ⅹ(README_zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.76.0-blue.svg)](https://github.com/GGF1sh/LoreRelay/releases)
[![GitHub](https://img.shields.io/badge/GitHub-GGF1sh%2FLoreRelay-181717?logo=github)](https://github.com/GGF1sh/LoreRelay)

**Local-first AI Game Master UI**

**Antigravity (蜈崎ｴｹ) ﾃ・LoreRelay ﾃ・ComfyUI 窶披・逕ｱ蜑肴ｲｿ螟ｧ讓｡蝙区球莉ｻ GM 逧・・閾ｪ蜉ｨ RPG 邇ｯ蠅・ｼ梧裏髴 API 蟇・徴・碁峺鬚晏､匁・譛ｬ縲・*

霑呎弍荳荳ｪ譛螟ｧ蛹門茜逕ｨ謔ｨ邇ｰ譛・AI 隶｢髦・噪 VSCode 謇ｩ螻包ｼ悟ｮ・ｻ灘粋莠・ワ SillyTavern 荳譬ｷ逧・錘遶ｯ閾ｪ逕ｱ蠎ｦ・御ｻ･蜿雁ワ Saga & Seeker 荳譬ｷ遑ｬ譬ｸ逧・CRPG 菴馴ｪ後・騾夊ｿ・焔蜉ｨ螟榊宛邊倩ｴｴ・域・騾夊ｿ・悽蝨ｰ莉｣逅・・蜉ｨ謇ｧ陦鯉ｼ我ｼ騾・JSON・悟ｮ・署萓帑ｺ・ｸ荳ｪ螳悟・蠑謾ｾ荳泌庄謾ｹ騾逧・廩acker Edition窶・UI 螻ゑｼ瑚ｮｩ謔ｨ蜿ｯ莉･閾ｪ逕ｱ蝨ｰ蝨ｨ閾ｪ蟾ｱ逧・識蠅・ｸｭ霑幄｡・Hack縲・
> 庁 **Notice:** 螯よ棡謔ｨ蝟懈ｬ｢霑吩ｸｪ謇ｩ螻包ｼ瑚ｯｷ閠・剔[隸ｷ謌大慢譚ｯ蜥門複 笘評(https://ko-fi.com/promptpalette)

---

## 検 Features

- 頂 **No Extra API Costs (by default):** 譛ｬ蝨ｰ LLM縲；rok CLI 謌匁焔蜉ｨ螟榊宛邊倩ｴｴ謫堺ｽ懈裏髴謖蛾㍼隶｡雍ｹ逧・API 蟇・徴縲ゆｻ・惠菴ｿ逕ｨ OpenRouter 譌ｶ髴隕・API 蟇・徴縲・- ｧｩ **Agent Bridge:** 螯よ棡菴ｿ逕ｨ Grok Build 遲牙庄蝨ｨ譛ｬ蝨ｰ謇ｧ陦檎噪 AI・梧お蜿ｯ莉･逶ｴ謗･蟆・Webview 逧・蛾｡ｹ蜥瑚・逕ｱ霎灘・蜿鷹∫ｻ・GM縲・- 耳 **Glassmorphism UI:** 蛹・性蜊企乗・閨雁､ｩ UI縲∽ｸ也阜隗ゆｸｻ鬚伜・謐｢蜥悟崟蜒冗判蟒顔噪荳ｰ蟇梧仞遉ｺ逡碁擇縲・- 笞費ｸ・**CRPG Character Sheet:** 蜿・Saga & Seeker 遲牙星蜿醍噪隗・ｧ臥憾諤・擇譚ｿ・悟庄邂｡逅・HP/MP 霑帛ｺｦ譚｡縲∵橿閭ｽ蜥檎黄蜩∵上・- 名・・**Local Image Generation & World Integration (v1.3+):** 荳・ComfyUI 驟榊粋・悟惠譛ｬ蝨ｰ蜊ｳ譌ｶ逕滓・ AI 謠冗ｻ倡噪蝨ｺ譎ｯ逕ｻ髱｢・帛ｹｶ荳・World System 閨泌勘・梧髪謖∝慍轤ｹ遘ｻ蜉ｨ譌ｶ逧・・蜉ｨ閭梧勹逕滓・縲・- 七 **Adaptive BGM & SFX:** 譬ｹ謐ｮ GM 逧・欠遉ｺ・瑚・蜉ｨ謗ｧ蛻ｶ蟷ｶ莠､蜿画ｷ｡蜈･豺｡蜃ｺ蝨ｨ `bgm.json` / `sfx.json` 荳ｭ豕ｨ蜀檎噪髻ｳ貅舌・- 逃 **Scenario Packs:** 蜿ｪ髴蜉霓ｽ蛹・性 `scenario.json` 逧・枚莉ｶ螟ｹ・悟叉蜿ｯ荳谺｡諤ｧ蠎皮畑蛻晏ｧ句惻譎ｯ縲∽ｸｻ鬚伜柱荳鍋畑 BGM/髻ｳ謨医・- 軸 **Built-in Dice Roller & Calculator:** 蜀・ｽｮ TRPG 蛻､螳壼ｿ・ｸ榊庄蟆醍噪謗ｷ鬪ｰ蟄撰ｼ・dX・牙柱謨ｰ蟄ｦ隶｡邂怜勣縲・- 沈 **Persistent Adventure Log:** 蟆・・髯ｩ譌･蠢嶺ｿ晏ｭ伜芦 `game_history.json`・悟叉菴ｿ驥榊星 VSCode 荵溯・諱｢螟榊紙蜿ｲ隶ｰ蠖輔・- 剥 **蝗槫粋譽譟･蝎ｨ・・urn Inspector・会ｼ・* 豈丞屓蜷磯ｪｰ蟄仙床雍ｦ縲∫憾諤∬｡･荳√∬ｧｦ蜿・lore 蜿ｯ隗・喧縲・- 当 **Lorebook & Memory UI:** ST 蜈ｼ螳ｹ lorebook 郛冶ｾ代∬ｮｰ蠢・頗邏｢鬚・ｧ医∫ｽｮ鬘ｶ lore 豕ｨ蜈･縲・- 汐 **Scenario & Party Director:** `scenario.json` / `party_director.json` 荳・`game_state` 霑占｡梧慮閨泌勘縲・- 導 **Remote Play (v0.7+):** LAN 蜉蜈･ URL・亥､榊宛蛻・ｺｫ・峨∫自螳ｶ / 隗よ・隗定牡縲８ebSocket 隶､隸√∬ｾ灘・髯仙宛縲・*遲ｾ蜷・`/media` URL**・・hort-TTL HMAC・計1.6.2+・峨・- 訣 **Living World System (v1.3+):** `world_forge.json`・・orld Forge・峨∵ｶ檎鴫讓｡諡溘仝orld 譬・ｭｾ鬘ｵ Mermaid 蝨ｰ蝗ｾ・・iome 驟崎牡荳主ｹｳ遘ｻ郛ｩ謾ｾ・計1.6.3+・峨・- 亮・・**Cartography / 鄒顔坩郤ｸ蝨ｰ蝗ｾ・・1.7+・悟庄騾蛾ｫ倡ｺｧ蜉溯・・会ｼ・* Region `x/y/biome` 竊・蟶・ｱ PNG 竊・ComfyUI ControlNet 鄒顔坩郤ｸ蝨ｰ蝗ｾ 竊・Webview 蝗ｾ髓牙匠蜉縲る怙 ComfyUI + SDXL Canny・帑ｻ・ｸ・ｱ蜿ｯ逕ｨ Python 蜊慕峡逕滓・縲・- 笞呻ｸ・**Emergent Simulation:** 蜀・ｽｮ閾ｪ蠕区ｨ｡諡溷勣・碁囂豈丞屓蜷域耳霑幄・蜉ｨ隶｡邂苓ｵ・ｺ先ｶ郁励∝漢蜉帛ｹｳ陦｡縲¨PC 螂ｽ諢溷ｺｦ荳取＄諠ｧ遲峨・- 孱・・**Robust State Management:** 荳企剞髓ｳ蛻ｶ縲・撼豕・ID 貂・炊縲∝ｮ牙・迥ｶ諤∬ｿ∫ｧｻ遲画惻蛻ｶ・碁亟豁｢蠎槫､ｧ謨ｰ謐ｮ蟇ｼ閾ｴ UI 蟠ｩ貅・・- 早・・**Visual Memory / Soulgaze (v1.5+):** VLM 蛻・梵逕滓・蝗ｾ蜒丞ｹｶ蜀吝・ `visual_memory.json`・悟惠蜷守ｻｭ GM 謠千､ｺ荳ｭ閾ｪ蜉ｨ豕ｨ蜈･隗・ｧ我ｸ贋ｸ区枚縲・- 白 **Audit Wave Hardening (v1.6):** 蟇ｹ State / GM Bridge / World / ST Import / Webview / Remote Play / Extension Hub 霑幄｡・7 霓ｨ驕灘ｮ｡隶｡・梧眠蠅・pure 鬪瑚ｯ∵ｨ｡蝮嶺ｸ主､ｧ驥丞屓蠖呈ｵ玖ｯ輔・
譫ｶ譫・ｯｦ隗｣・喙`docs/WORLD_AND_VISUAL_MEMORY.md`](docs/WORLD_AND_VISUAL_MEMORY.md)

### 謇髴邇ｯ蠅・ｸ主庄騾牙粥閭ｽ

| 螻らｺｧ | 蜀・ｮｹ |
|------|------|
| **蠢・怙・域ｸ蠢・ｸｸ邇ｩ・・* | VSCode 1.85+縲￣ython縲～TextAdventureGMSkill`・・SKILL.md`・・|
| **謗ｨ闕・* | GM Bridge・・rok / Ollama / 蜑ｪ雍ｴ譚ｿ遲会ｼ画・謇句勘螟榊宛邊倩ｴｴ |
| **蜿ｯ騾・窶・蝗ｾ蜒・* | ComfyUI・・PI 讓｡蠑擾ｼ俄・蝨ｺ譎ｯ閭梧勹荳守ｾ顔坩郤ｸ蝨ｰ蝗ｾ |
| **蜿ｯ騾・窶・隗・ｧ芽ｮｰ蠢・* | VLM・・llama `llava` 謌・OpenRouter 螟壽ｨ｡諤・ｼ俄・Soulgaze |
| **蜿ｯ騾・窶・螟壻ｺｺ** | Remote Play・亥酔荳螻蝓溽ｽ托ｼ・|
| **蜿ｯ騾・窶・蝨ｰ蝗ｾ** | Cartography 窶・莉・ｸ・ｱ PNG 蜿ｪ髴 Python・帶薯逕ｻ鄒顔坩郤ｸ髴 ComfyUI + SDXL Canny |

### 謨ｰ謐ｮ豬・ｼ・ersist-Before-Narrate・・
GM 豈丞屓蜷亥ｺ泌・蜈･ **`turn_result.json`**・・statePatch` + `narration` + `gmEntry` + `turnId`・峨よ黄螻暮ｪ瑚ｯ∬｡･荳∝錘蜷亥ｹｶ蛻ｰ **`game_state.json`**・悟ｹｶ蜷・`state_journal.ndjson` 霑ｽ蜉螳｡隶｡隶ｰ蠖輔・
逶ｴ謗･隕・尠 **`game_state.json`** 荳ｺ**邏ｧ諤･蝗樣**・域焔蜉ｨ邊倩ｴｴ謌匁立迚・GM・峨よｭ､譌ｶ `turnResultFallback` 莨壼粋謌・`turn_result.json`・御ｽｿ譽譟･蝎ｨ縲∵律蠢嶺ｸ・MediaAgent 襍ｰ蜷御ｸ霍ｯ蠕・・
**Cartography 豬∵ｰｴ郤ｿ・亥庄騾会ｼ会ｼ・* `world_forge.json`・・egion 逧・`x` / `y` / `biome`・俄・ 蟶・ｱ PNG・・world_map.layout.png`・俄・・亥庄騾会ｼ韻omfyUI ControlNet 竊・`world_map.png` 竊・World 譬・ｭｾ鬘ｵ 桃 蝗ｾ髓牙匠蜉

---

## 萄 Screenshots & Demo

<p align="center">
  <img src="docs/assets/hero-ui.png" alt="LoreRelay main UI" width="720" />
</p>

| Inspector | Remote Play | Party Director |
|:---:|:---:|:---:|
| <img src="docs/assets/screenshot-inspector.png" width="240" alt="Turn Inspector" /> | <img src="docs/assets/screenshot-remote-play.png" width="240" alt="Remote Play" /> | <img src="docs/assets/screenshot-party-director.png" width="240" alt="Party Director" /> |

| Lorebook | ComfyUI | World Map |
|:---:|:---:|:---:|
| <img src="docs/assets/screenshot-lorebook.png" width="240" alt="Lorebook editor" /> | <img src="docs/assets/screenshot-comfyui.png" width="240" alt="ComfyUI scene generation" /> | <img src="docs/assets/screenshot-world-map.png" width="240" alt="Parchment world map with pins" /> |

譖ｿ謐｢荳ｺ逵溷ｮ樊穐蝗ｾ謌・GIF 逧・ｭ･鬪､隗・[`DEMO.md`](DEMO.md)縲・
---

## 噫 How to Play

### 蠢ｫ騾溷ｼ蟋具ｼ育ｺｦ 3 蛻・帖・・
1. `LoreRelay: Load Scenario Pack` 竊・`sample-scenarios/lost-catacombs`
2. `LoreRelay: Open Game UI` 竊・蝨ｨ Game Rules 荳ｭ蜷ｯ逕ｨ **World Forge**
3. **World** 譬・ｭｾ鬘ｵ 竊・**Parchment** 譟･逵句酔謐・噪 `world_map.layout.png` 荳主崟髓会ｼ域裏髴 ComfyUI・・4. 霑幄｡御ｸ蝗槫粋・梧衍逵・GM 蜩榊ｺ・
螳梧紛謠堤判鄒顔坩郤ｸ蝨ｰ蝗ｾ・壼星蜉ｨ ComfyUI 蜷取鴬陦・`LoreRelay: Generate World Map Image`縲りｯｦ隗・[`docs/CARTOGRAPHY_COMFYUI.md`](docs/CARTOGRAPHY_COMFYUI.md)・・*蜿ｯ騾・/ 鬮倡ｺｧ**・峨・
隸･謇ｩ螻穂ｽｿ逕ｨ譚ｾ謨｣閠ｦ蜷域惻蛻ｶ・檎尅蜷ｬ AI 蟇ｼ蜃ｺ逧・`turn_result.json`・郁ｧ・激・画・ `game_state.json`・亥屓騾・牙ｹｶ貂ｲ譟・UI縲よｹ謐ｮ謔ｨ逧・識蠅・ｼ梧怏荳､遘肴ｸｸ邇ｩ譁ｹ蠑上・
### Mode A: 閾ｪ蜉ｨ蜷梧ｭ･讓｡蠑・(Recommended)
**騾ら畑蟇ｹ雎｡・・* 菴ｿ逕ｨ**蜿ｯ蜀吝・譛ｬ蝨ｰ譁・ｻｶ逧・ｻ｣逅・AI**・亥ｦ・Antigravity, Grok CLI, VSCode Copilot (Cursor)・臥噪逕ｨ謌ｷ縲・
1. 隶ｩ AI 隸ｻ蜿門桁蜷ｫ逧・`SKILL.md`・悟ｹｶ謖・､ｺ窶懈潔辣ｧ豁､謚閭ｽ蠑蟋区球莉ｻ貂ｸ謌丈ｸｻ謖・ｼ・M・俄昴・2. 荵句錘・梧お蜿ｪ髴荳・AI 閨雁､ｩ蜊ｳ蜿ｯ縲・I 莨夊・蜉ｨ謗ｷ鬪ｰ蟄舌∽ｽｿ逕ｨ ComfyUI 逕滓・蝗ｾ蜒丞ｹｶ譖ｴ譁ｰ `game_state.json`縲・3. 蝨ｨ VSCode 荳ｭ菫晄戟豁､謇ｩ螻墓遠蠑・袈I 蟆・ｮ樊慮譖ｴ譁ｰ・・
> **蟇ｹ莠・Antigravity 逕ｨ謌ｷ・・* 謔ｨ蜿ｯ莉･霓ｻ譚ｾ謫堺ｽ懶ｼ夂せ蜃ｻ Webview 荳ｭ逧・蛾｡ｹ 竊・螟榊宛蛻ｰ蜑ｪ雍ｴ譚ｿ 竊・邊倩ｴｴ蛻ｰ Antigravity 閨雁､ｩ荳ｭ 竊・閾ｪ蜉ｨ譖ｴ譁ｰ縲りｯｦ諠・ｯｷ蜿る・ [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md)縲・
### Mode B: 謇句勘螟榊宛邊倩ｴｴ讓｡蠑・**騾ら畑蟇ｹ雎｡・・* 菴ｿ逕ｨ譬・㊥鄂鷹｡ｵ迚・ChatGPT, Claude, 謌・Gemini 逧・畑謌ｷ縲・
1. 蟆・`SKILL.md` 逧・枚譛ｬ螟榊宛蟷ｶ邊倩ｴｴ蛻ｰ鄂鷹｡ｵ迚・AI 荳ｭ・悟ｹｶ隸ｴ・壺懆ｯｷ謖臥・霑吩ｺ帶欠遉ｺ諡・ｻｻ GM縲や・2. 螟榊宛 AI 霑泌屓逧・JSON 莉｣遐∝摎・悟ｹｶ謇句勘蝨ｨ VSCode 荳ｭ隕・尠菫晏ｭ・`game_state.json`縲・3. 菫晏ｭ倡噪迸ｬ髣ｴ・祁SCode UI 莨夊・蜉ｨ蛻・困縲ゑｼ亥崟蜒冗函謌仙柱謗ｷ鬪ｰ蟄宣怙謇句勘謇ｧ陦鯉ｼ梧・菴ｿ逕ｨ鄂鷹｡ｵ迚・AI 逧・粥閭ｽ莉｣譖ｿ・峨・
---

## 屏・・Setup & Installation

### 1. Prerequisites
- **VSCode** (v1.85+) 窶・蠢・怙
- **Python** 窶・蠢・怙・域執鬪ｰ縲∝ｸ・ｱ蝨ｰ蝗ｾ縲；M 譯･謗･閼壽悽・・- **TextAdventureGMSkill** 窶・蠢・怙・・SKILL.md` 荳・`scripts/`・梧叛蝨ｨ譛ｬ莉灘ｺ捺浴・・- **ComfyUI** 窶・*蜿ｯ騾・・井ｻ・惻譎ｯ蝗ｾ荳守ｾ顔坩郤ｸ蝨ｰ蝗ｾ・幃怙 API 讓｡蠑丞星蜉ｨ・・- **VLM** 窶・*蜿ｯ騾・・・isual Memory / Soulgaze・薫llama 謌・OpenRouter・・
### 2. Quick setup (recommended)

蟆・`TextAdventureGMSkill` 謾ｾ蝨ｨ `text-adventure-vsce` 譌∬ｾｹ・井ｾ句ｦゑｼ壼惠 `C:\AI\` 逶ｮ蠖穂ｸ具ｼ会ｼ・
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

閼壽悽蟆・鴬陦鯉ｼ・- 閾ｪ蜉ｨ譽豬・GM 謚閭ｽ霍ｯ蠕・竊・逕滓・ `my-adventure/.vscode/settings.json`
- `npm install` / `compile` / `test`
- (蜿ｯ騾・ VSIX 謇灘桁 竊・`code --install-extension`
- 逕滓・ `text-adventure.code-workspace`・・ 荳ｪ譬ｹ逶ｮ蠖包ｼ哦ame + Skill + Extension・・
騾蛾｡ｹ遉ｺ萓具ｼ啻-Locale en` `-GmProvider clipboard` `-SkipVsix`

### 3. Manual extension installation
1. 蜈矩嚀謌紋ｸ玖ｽｽ豁､莉｣遐∝ｺ薙・2. 蝨ｨ VSCode 荳ｭ謇灘ｼ譁・ｻｶ螟ｹ・悟ｹｶ蝨ｨ扈育ｫｯ荳ｭ霑占｡・`npm install`縲・3. 謖・`F5` 髞ｮ蠑蟋玖ｰ・ｯ墓黄螻包ｼ梧・菴ｿ逕ｨ `npx @vscode/vsce package` 螳芽｣・VSIX縲・4. 莉主多莉､髱｢譚ｿ (`Ctrl+Shift+P`) 霑占｡・`LoreRelay: Open Game UI` 莉･謇灘ｼ髱｢譚ｿ縲・
### 4. Configuration
蝨ｨ VSCode 隶ｾ鄂ｮ荳ｭ謳懃ｴ｢ `textAdventure.skillPath`・悟ｹｶ謖・ｮ夐囂髯・噪 `comfyui_generate.py` 閼壽悽逧・ｻ晏ｯｹ霍ｯ蠕・・
荳ｻ隕∬ｮｾ鄂ｮ・・
- `textAdventure.skillPath` 窶・`comfyui_generate.py` 逧・ｻ晏ｯｹ霍ｯ蠕・- `textAdventure.locale` 窶・UI / 髞呵ｯｯ / GM 謠千､ｺ逧・ｯｭ險・・ja` / `en` / `zh-CN` / `zh-TW`・峨ゆｹ溷庄莉･莉・Webview 譬・｢俶冗噪 倹 譖ｴ謾ｹ縲・- `textAdventure.gmBridge.provider` 窶・`grok` / `ollama` / `koboldcpp` / `clipboard` / `command` (隸ｦ諠・ｧ・`GM_BRIDGE_PRESETS.md`)
- `textAdventure.grokBridge.*` 窶・蜷ｯ逕ｨ Grok Build 閾ｪ蜉ｨ蜿鷹√，LI 霍ｯ蠕・∝錘螟・ｮｾ鄂ｮ
- `textAdventure.imageGen.*` 窶・ComfyUI / Stability Matrix URL縲…heckpoint縲『orkflow縲∫函謌仙ｰｺ蟇ｸ
- `textAdventure.imageGen.controlNet` 窶・Cartography 逕ｨ SDXL Canny 讓｡蝙句錐・亥庄騾会ｼ・- `textAdventure.vlm.*` 窶・Soulgaze 逕ｨ VLM・・provider` / `model` / `endpoint`・・- `textAdventure.mediaAgent.*` 窶・蜷主床蝗ｾ蜒城弌蛻励；M 豬∝ｼ乗掠譛・BGM/SFX
- `textAdventure.remotePlay.*` 窶・遶ｯ蜿｣縲～bindAddress`縲～mediaUrlTtlSec`・育ｭｾ蜷榊ｪ剃ｽ・URL 譛画譜譛滂ｼ臥ｭ・- `textAdventure.bgm.*` 窶・BGM 驟咲ｽｮ譁・ｻｶ蜥碁浹驥・- `textAdventure.sfx.*` 窶・SFX 驟咲ｽｮ譁・ｻｶ蜥碁浹驥・
### 5. 蜻ｽ莉､髱｢譚ｿ・井ｸｻ隕∝多莉､・・
| 蜻ｽ莉､ | 逕ｨ騾・|
|------|------|
| `LoreRelay: Open Game UI` | 謇灘ｼ荳ｻ Webview |
| `LoreRelay: Load Scenario Pack` | 蜉霓ｽ蜷ｫ `scenario.json` 逧・枚莉ｶ螟ｹ |
| `LoreRelay: Generate World Forge` | 遞句ｺ丞喧逕滓・ `world_forge.json` |
| `LoreRelay: Generate World Map Image` | 騾夊ｿ・ComfyUI 逕滓・鄒顔坩郤ｸ蝨ｰ蝗ｾ・亥庄騾会ｼ・|
| `LoreRelay: Start Remote Play (LAN)` | 蜿大ｸ・ｱ蝓溽ｽ大刈蜈･ URL |
| `LoreRelay: List Image Models` | 蛻怜・ ComfyUI checkpoint |
| `LoreRelay: Import SillyTavern Character Card` | 蟇ｼ蜈･ ST 隗定牡蜊｡ |
| `LoreRelay: Import SillyTavern Lorebook` | 蟇ｼ蜈･ ST lorebook |
| `LoreRelay: Export Scenario Pack (Workshop ZIP)` | 蟇ｼ蜃ｺ蛻・書逕ｨ ZIP |
| `LoreRelay: Validate Scenario Pack` | 鬪瑚ｯ∝桁扈捺桷 |

### 6. 蟾･菴懷玄荳ｻ隕∵枚莉ｶ

| 譁・ｻｶ | 菴懃畑 |
|------|------|
| `game_state.json` | UI 貂ｲ譟鍋噪蜷亥ｹｶ貂ｸ謌冗憾諤・|
| `turn_result.json` | 豈丞屓蜷・GM 霎灘・・郁ｧ・激謖∽ｹ・喧・・|
| `state_journal.ndjson` | statePatch 螳｡隶｡譌･蠢・|
| `world_forge.json` | 髱呎∽ｸ也阜隶ｾ隶｡・亥玄蝓溘∵ｴｾ邉ｻ縲¨PC 遘榊ｭ撰ｼ・|
| `world_state.json` | 蜉ｨ諤∵ｨ｡諡滂ｼ亥ｷｲ隶ｿ髣ｮ縲∵ｴｾ邉ｻ襍・ｺ千ｭ会ｼ・|
| `visual_memory.json` | VLM 諠・勹隶ｰ蠢・|
| `game_history.json` | 蜀帝勦譌･蠢暦ｼ磯㍾蜷ｯ蜷取△螟搾ｼ・|
| `world_map.layout.png` / `world_map.png` | Cartography 蟶・ｱ / 鄒顔坩郤ｸ蝗ｾ |
| `npc_registry.json` | NPC 隶､遏･荳主・邉ｻ |

### 7. Scenario Packs
莉主多莉､髱｢譚ｿ霑占｡・`LoreRelay: Load Scenario Pack` 蟷ｶ騾画叫蛹・性 `scenario.json` 逧・枚莉ｶ螟ｹ縲・
**蜷梧号遉ｺ萓具ｼ・ 譛ｬ・・* 窶・`sample-scenarios/`・・
| 譁・ｻｶ螟ｹ | 邀ｻ蝙・| 荳ｻ鬚・| 螟・ｳｨ |
|--------|------|------|------|
| `lost-catacombs` | 扈丞・蝨ｰ迚｢謗｢邏｢ | fantasy | **Cartography 貍皮､ｺ**・・world_forge.json` + `world_map.layout.png`・・|
| `neon-rain` | 襍帛忽譛句・鮟題牡逕ｵ蠖ｱ | cyberpunk | |
| `harbor-mist` | 貂ｯ蜿｣謔ｬ逍・| modern | |

GM 謚閭ｽ遶ｯ・啻TextAdventureGMSkill/scenarios/`縲・
### 8. SillyTavern 蜈ｼ螳ｹ荳・Workshop

- 騾夊ｿ・ｸ願ｿｰ蜻ｽ莉､謌・Webview 蟇ｼ蜈･ ST 隗定牡荳・lorebook縲りｯｦ隗・[`SILLYTAVERN_COMPAT.md`](SILLYTAVERN_COMPAT.md)
- 蟇ｼ蜃ｺ蟷ｶ鬪瑚ｯ∝惻譎ｯ蛹・庄逕滓・ Workshop 逕ｨ ZIP・亥ｸょ惻蜿大ｸ・ｰ・比ｸｭ・・
### 9. 讓｡蝙倶ｸ・ComfyUI 鬚・ｮｾ
- [`MODEL_PRESETS.md`](MODEL_PRESETS.md) 窶・莉・`presets/` 螟榊宛 JSON
- [`COMFYUI_WORKFLOWS.md`](COMFYUI_WORKFLOWS.md) 窶・蝨ｺ譎ｯ荳・Cartography 蟾･菴懈ｵ・- Cartography・亥庄騾会ｼ会ｼ喙`docs/CARTOGRAPHY_COMFYUI.md`](docs/CARTOGRAPHY_COMFYUI.md) ﾂｷ [`docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md`](docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md) ﾂｷ [`docs/CARTOGRAPHY_DESIGN.md`](docs/CARTOGRAPHY_DESIGN.md)
- 貍皮､ｺ豁･鬪､・喙`sample-scenarios/lost-catacombs/CARTOGRAPHY_DEMO.md`](sample-scenarios/lost-catacombs/CARTOGRAPHY_DEMO.md)

### 10. 譁・｡｣邏｢蠑・
| 譁・｡｣ | 蜀・ｮｹ |
|------|------|
| [`AI_HANDOVER.md`](AI_HANDOVER.md) | 髱｢蜷大・莉・AI 逧・ｺ､謗･隸ｴ譏・|
| [`CHANGELOG.md`](CHANGELOG.md) | 迚域悽蜴・彰 |
| [`GM_BRIDGE_PRESETS.md`](GM_BRIDGE_PRESETS.md) | Ollama / KoboldCPP 鬚・ｮｾ |
| [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md) | Antigravity 蟾･菴懈ｵ・|
| [`SILLYTAVERN_COMPAT.md`](SILLYTAVERN_COMPAT.md) | SillyTavern 蜈ｼ螳ｹ隗・ｼ |
| [`docs/WORLD_AND_VISUAL_MEMORY.md`](docs/WORLD_AND_VISUAL_MEMORY.md) | World / Visual Memory 譫ｶ譫・|
| [`DEMO.md`](DEMO.md) | 譖ｿ謐｢謌ｪ蝗ｾ荳取ｼ皮､ｺ GIF |

---

## 亮・・Roadmap

> **迚域悽豁｣譛ｬ・・* `package.json`・亥ｽ灘燕 **1.52.0**・可ｷ [`CHANGELOG.md`](CHANGELOG.md) ﾂｷ [`docs/VERSION_TRUTH.md`](docs/VERSION_TRUTH.md) ﾂｷ 莉ｻ蜉｡逵区攸 [`AI_ROADMAP.md`](AI_ROADMAP.md)

**蟾ｲ螳樒鴫・・1.33.0 鞫倩ｦ・ｼ・*

| 荳紋ｻ｣ | 荳ｻ隕∝・螳ｹ |
|------|----------|
| **v1.3窶・.7** | World Forge / 豸檎鴫讓｡諡・/ Visual Memory / Audit Wave / Cartography |
| **v1.10窶・.11** | Quest Board・・vent-to-Quest・可ｷ Agentic GM ﾂｷ Git Timeline ﾂｷ Adaptive TTS |
| **v1.13窶・.18** | Tile Overmap ﾂｷ Cartography C8/C9 ﾂｷ Debug sandbox ﾂｷ 荳也阜譌ｶ髣ｴ謗ｨ霑・|
| **v1.19窶・.21** | Chronicle ﾂｷ Pacing Director ﾂｷ 豢ｾ邉ｻ螢ｰ譛・ﾂｷ 譌・秘・驕・ﾂｷ Replay Export |
| **v1.23窶・.33** | Living World 扈乗ｵ趣ｼ・ommerce / Agency・可ｷ Commerce UI ﾂｷ 菫｡莉ｻ閨泌勘菴咲ｽｮ ﾂｷ **LW3 鄒∫ｻ・* |

隸ｦ隗・[`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md) 荳・`sample-scenarios/trade-routes`縲・
**隶｡蛻剃ｸｭ**

- README / DEMO 謌ｪ蝗ｾ荳・GIF 譖ｴ譁ｰ
- Overmap 蝗ｾ蜒冗逃迚・”azard 蜊戊｡・GM 豕ｨ蜈･
- Prompt budget 莨伜・郤ｧ貊大勘・磯柄莨夊ｯ晢ｼ・- Workshop / 蟶ょ惻蜿大ｸ・ｰ・・
---

## ､・Contributing & Support
隸･鬘ｹ逶ｮ譏ｯ荳荳ｪ螳樣ｪ梧ｧ逧・OSS・梧葎蝨ｨ謌蝉ｸｺ AI 譌ｶ莉｣逧・懈枚蟄怜・髯ｩ譁ｰ貂ｸ荵仙惻窶昴・髱槫ｸｸ谺｢霑取署莠､髞呵ｯｯ謚･蜻雁柱隸ｷ豎ゑｼ・R・会ｼ・
螯よ棡霑吩ｸｪ鬘ｹ逶ｮ隶ｩ謔ｨ諢溷芦蜈ｴ螂・.....
痩 **[Buy me a coffee 笘評(https://ko-fi.com/promptpalette)**

---
**Enjoy your adventure!**
