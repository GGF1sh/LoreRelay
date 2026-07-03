# 繝舌・繧ｸ繝ｧ繝ｳ縺ｮ豁｣譛ｬ・・I繝ｻ莠ｺ髢灘髄縺托ｼ・
LoreRelay 縺ｫ縺ｯ **3 遞ｮ鬘槭・縲檎沿縲・* 縺後≠繧翫∵ｷｷ蜷後☆繧九→ Web Grok / ChatGPT 遲峨′縲稽ain 縺ｯ v1.6.1縲阪→隱､隱阪＠縺ｾ縺吶・
## 1. 繧ｽ繝ｼ繧ｹ縺ｮ豁｣譛ｬ・医＞縺｡縺ｰ繧謎ｿ｡鬆ｼ縺吶ｋ・・
| 遒ｺ隱榊・ | 諢丞袖 |
|--------|------|
| `package.json` 縺ｮ `version` | **迴ｾ蝨ｨ縺ｮ繧ｳ繝ｼ繝臥沿** |
| `CHANGELOG.md` 縺ｮ蜈磯ｭ繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ・・[Unreleased]` 縺ｮ谺｡・・| **螳溯｣・ｸ医∩讖溯・縺ｮ豁｣譛ｬ** |
| `git log origin/main -1` | **蜈ｬ髢・main 縺ｮ蜈磯ｭ繧ｳ繝溘ャ繝・* |

**繝ｪ繝昴ず繝医Μ:** https://github.com/GGF1sh/LoreRelay  
**繝ｭ繝ｼ繧ｫ繝ｫ豁｣譛ｬ繝代せ:** `C:\AI\text-adventure-vsce`・・C:\AI\LoreRelay` 縺ｯ蜿､縺・け繝ｭ繝ｼ繝ｳ縺ｮ縺薙→縺後≠繧具ｼ・
## 2. 驟榊ｸ・・豁｣譛ｬ・・SIX繝ｻ譖ｴ譁ｰ騾夂衍・・
| 遒ｺ隱榊・ | 諢丞袖 |
|--------|------|
| [GitHub Releases](https://github.com/GGF1sh/LoreRelay/releases) | **繝ｦ繝ｼ繧ｶ繝ｼ縺・`Check for Updates` 縺ｧ蜿悶ｋ迚・* |
| 繧ｿ繧ｰ `v*` push | `.github/workflows/release.yml` 縺・VSIX 繧呈ｷｻ莉假ｼ・package.json` 縺ｨ荳閾ｴ蠢・茨ｼ・|

**豕ｨ諢・** main 縺ｮ `package.json` 縺碁ｲ繧薙〒縺・※繧ゅ；itHub Release 縺悟商縺・ち繧ｰ縺ｮ縺ｾ縺ｾ縺ｪ繧峨後う繝ｳ繧ｹ繝医・繝ｫ貂医∩諡｡蠑ｵ縺ｯ蜿､縺・咲憾諷九ゅさ繝ｼ繝峨・騾ｲ繧薙〒縺・ｋ縺・**驟榊ｸ・・驕・ｌ縺ｦ縺・ｋ**縲・
## 3. 隱ｬ譏弱ラ繧ｭ繝･繝｡繝ｳ繝茨ｼ亥ｱ･豁ｴ繝ｻ繧ｹ繝翫ャ繝励す繝ｧ繝・ヨ・・
`README.md` Features 蜀・・縲・v1.3+)縲阪～WORLD_AND_VISUAL_MEMORY.md` 縺ｮ縲計1.6.1 譎らせ縲阪～README` 譛ｫ蟆ｾ Roadmap 縺ｮ **荳紋ｻ｣陦ｨ** 縺ｪ縺ｩ縺ｯ **讖溯・蟆主・譎ゅ・繝ｩ繝吶Ν** 縺ｾ縺溘・ **隕∫ｴ・*縲ら樟陦檎沿縺ｮ謨ｰ蟄励・ `package.json` 縺梧ｭ｣譛ｬ縲・
| 繝峨く繝･繝｡繝ｳ繝・| 蠖ｹ蜑ｲ |
|--------------|------|
| [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) | stable / experimental 縺ｮ蛻晁ｦ句髄縺台ｸ隕ｧ |
| [`AI_ROADMAP.md`](../AI_ROADMAP.md) | 繧ｿ繧ｹ繧ｯ鮟呈攸・・hase 螳御ｺ・・谺｡譛溘ヨ繝ｩ繝・け・・|
| [`AI_SHARED_LOG.md`](../AI_SHARED_LOG.md) 蜈磯ｭ **Current Snapshot** | AI 蜷代￠蜍慕噪繧ｵ繝槭Μ |

## AI 菴懈･ｭ蜑阪・ 30 遘偵メ繧ｧ繝・け

```powershell
cd C:\AI\text-adventure-vsce
node -p "require('./package.json').version"
node scripts/check_version_consistency.js
git fetch origin
git log origin/main --oneline -1
git tag -l "v*" | Sort-Object { [version]($_ -replace '^v','') } | Select-Object -Last 3
```

## 繧ｺ繝ｬ繧堤峩縺吶→縺阪・蜆ｪ蜈磯・ｽ・
1. **繧ｿ繧ｰ + Release** 窶・`package.json` 縺ｨ荳閾ｴ縺吶ｋ `vX.Y.Z` 繧・push・磯・蟶・ｒ霑ｽ縺・▽縺九○繧具ｼ・2. **Current Snapshot 譖ｴ譁ｰ** 窶・`AI_SHARED_LOG.md`
3. **README 繝舌ャ繧ｸ + Roadmap** 窶・`package.json` 縺ｨ蜷梧悄
4. **繧ｭ繝｣繝・メ繧｢繝・・繝励Ο繝ｳ繝励ヨ** 窶・`VSCODE_CHATGPT_CATCHUP.md`
5. **螻･豁ｴ繝峨く繝･繝｡繝ｳ繝・* 窶・迚育分蜿ｷ繧偵檎樟陦後阪→譖ｸ縺肴鋤縺医ｋ縺ｮ縺ｧ縺ｯ縺ｪ縺上∝・鬆ｭ縺ｫ縲後い繝ｼ繧ｭ繝・け繝√Ε蜿り・・迴ｾ陦後・ CHANGELOG縲阪→豕ｨ險・
## 迴ｾ陦鯉ｼ域焔蜍墓峩譁ｰ: 2026-07-04・・
| 鬆・岼 | 蛟､ |
|------|-----|
| `package.json` | **1.66.0** |
| CHANGELOG 蜈磯ｭ | **[1.63.0]** Settlement Mode M1 (pure core) |
| Campaign Kit | Phase A窶敵 ﾂｷ 7 genre presets ﾂｷ sell_discovery ﾂｷ services state machine (condition/estValue) ﾂｷ **campaign resources**(campaignResourceOps) ﾂｷ factionId on campaign quests ﾂｷ `scrapbound-settlement` sample |
| Living World | LW1 Commerce 縺ｫ 2縺､逶ｮ縺ｮ萓｡譬ｼ繝峨Λ繧､繝占ｿｽ蜉(v1.51.0): 豢ｾ髢･/region繧､繝吶Φ繝磯｣蜍・+ **繝励Ξ繧､繝､繝ｼ隧募愛騾｣蜍・*(faction-controlled markets) |
| World Observatory | 譁ｰ隕・v1.53.0): 蟶ょｴ萓｡譬ｼ螻･豁ｴ繧ｹ繝代・繧ｯ繝ｩ繧､繝ｳ繝ｻ蟷ｴ莉｣險倥ち繧､繝繝ｩ繧､繝ｳ繝ｻ繝励Ξ繧､繝､繝ｼ繧ｿ繝ｼ繝ｳ縺ｪ縺励〒荳也阜繧帝ｲ繧√ｋ隕ｳ貂ｬ閠・ユ繧｣繝・け(watch=辟｡繧ｳ繧ｹ繝・advance=鬟滓侭豸郁ｲｻ)縲ＡenableWorldObservatory` 譌｢螳唹FF |
| Domain Mode | D1窶泥5 + **D3 UI 螳御ｺ・*・・.40.0・可ｷ F7窶擢10 engine + World 繧ｿ繝・UI ﾂｷ v1.40.1 hardening |
| Guild Master (F11) | **G1窶敵4 螳御ｺ・*・・.41.0窶・.44.1・可ｷ v1.44.1 hardening ﾂｷ `enableGuildMode` 譌｢螳・OFF |
| Parlor Mode | v1.34.0 蜃ｺ闕ｷ貂・|
| Living World | v1.23窶・.34・・ommerce / Agency / LW3・・ Domain v1.39.x窶・.40.x |
| GitHub Release latest | **v1.59.0**・・lorerelay-1.59.0.vsix` ﾂｷ 繧ｿ繧ｰ push 縺ｧ閾ｪ蜍墓峩譁ｰ・・|
| 繝・せ繝・| `npm test` **142/142**・・check_version_consistency.js` 蜷ｫ繧・・|