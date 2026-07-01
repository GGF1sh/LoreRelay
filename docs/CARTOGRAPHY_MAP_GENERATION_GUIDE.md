# Cartography Map Generation Guide

LoreRelay の Cartography を **雰囲気イラスト** ではなく、`world_forge.json` の `x` / `y` / `biome` / `connectedTo` と整合する **RPG 用トップダウン地図** として生成するための調査まとめと推奨設定です。

関連: [`CARTOGRAPHY_COMFYUI.md`](CARTOGRAPHY_COMFYUI.md) · [`CARTOGRAPHY_DESIGN.md`](CARTOGRAPHY_DESIGN.md) · [`CARTOGRAPHY_WORKFLOW_CONTRACT.md`](CARTOGRAPHY_WORKFLOW_CONTRACT.md)

---

## 1. 問題の整理

| 症状 | よくある原因 |
|------|-------------|
| 星図・魔法陣・円形ダイアグラムになる | プロンプトの `compass rose` / `ornate border`、円形 layout の Canny が「放射状構図」を誘導 |
| 地域の位置が JSON とズレる | ControlNet 強度が低い、layout のエッジが弱い、プロンプトが地理より装飾を強調 |
| 地名が読めない・文字化け | SD にラベル生成を任せている（**禁止**。HTML overlay に分離する） |
| 海と森の配置が入れ替わる | biome 情報が ControlNet に渡っていない（色付き円は Canny では biome 意味を失う） |

**設計原則:** 画像は **地形・道路・海岸線の絵** のみ。座標・地名・現在地は **JSON → HTML/CSS overlay**。

---

## 2. 推奨パイプライン（JSON → layout → ControlNet → parchment）

```text
world_forge.json
  │
  ├─► render_cartography_layout.py
  │     ・パーチメント地色
  │     ・biome 色の地域ブロブ（x/y/radius）
  │     ・connectedTo を太い黒線（道路）
  │     ・地域輪郭リング（Canny 用エッジ強化）
  │
  ├─► ComfyUI: Canny（layout からエッジ抽出）
  │     └─► SDXL Canny ControlNet（地理骨格を拘束）
  │
  ├─► プロンプト: regional RPG map / top-down cartography
  │     ネガティブ: star chart / magic circle / text / compass centerpiece
  │
  └─► Webview overlay
        ・📍 地点ピン（locationId → leftPct/topPct）
        ・地域ラベル（region.name、画像生成とは別）
```

---

## 3. ControlNet / プリプロセッサ選定

| 方式 | 地理保持 | 向いている layout | LoreRelay での位置づけ |
|------|---------|-------------------|------------------------|
| **Canny** | ◎ 道路・輪郭 | 太線 + 地域リング | **現行デフォルト**（`workflow_cartography_sdxl_canny.json`） |
| **Lineart** | ◎ インク線画 | 白地 + 黒線のみの layout | 次段階（線画専用 layout を別 PNG で用意） |
| **Scribble** | △ 大雑把 | ラフスケッチ | 座標精度が落ちるため非推奨 |
| **Tile** | × 構図保持なし | 任意 | 低 strength (0.15–0.25) で **紙質テクスチャ** のみ（layout 用ではない） |
| **Seg / Depth** | ○ 色面分割 |  biome マスク PNG | 将来: biome 専用 2nd ControlNet |

**結論:** まず **Canny + 太い道路 layout** で `connectedTo` グラフを拘束。biome はプロンプト内 `featuring N forest, M sea…` と layout 色で補助。二段階化するなら **Canny（道路）+ 低 strength Tile（紙）**。

### Canny 閾値の目安（layout PNG 向け）

| パラメータ | 旧値 | 推奨 | 効果 |
|-----------|------|------|------|
| `low_threshold` | 0.40 | **0.28** | 細い道路もエッジ化 |
| `high_threshold` | 0.80 | **0.62** | 過剰ノイズを抑制 |
| `strength` | 0.82 | **0.88** | 地理ドリフト低減 |
| `end_percent` | 0.95 | **1.0** | 終盤まで構図を固定 |

---

## 4. SDXL / Flux チェックポイント

| モデル | 地図向き | ControlNet | メモ |
|--------|---------|------------|------|
| **Illustrious XL** | ◎ | SDXL Canny | LoreRelay `illustrious` プリセットと相性良 |
| **SDXL 1.0 base** | ○ | SDXL Canny | フォールバック。線はやや弱い |
| **Flux.1 Dev** | ◎ 細部 | **Flux Canny**（別 workflow） | `flux1-canny-dev` 等。現行 JSON は SDXL 専用 |

Flux を使う場合は checkpoint / ControlNet / VAE をすべて Flux 系に差し替えた workflow が必要（本リポジトリは SDXL Canny を標準同梱）。

### 任意 LoRA（推奨プリセット — 自動適用なし）

デフォルトは **LoRA なし**（Voronoi + Canny + theme prompt）。試すときだけ `TA_LORA` / `TA_LORA_WEIGHT` を手動設定。

**ComfyUI 向けフル一覧（テーマ別・Top 5・コピペ env・プロンプト例）:** [`CARTOGRAPHY_RECOMMENDED_LORAS.md`](CARTOGRAPHY_RECOMMENDED_LORAS.md)

| プリセット | ファイル名の例 | weight | 向く theme | Civitai |
|-----------|---------------|--------|-----------|---------|
| **Mapcraft (Illustrious v1)** ★第一推奨 | `mapcraft_il_v1.safetensors` | 0.45 | fantasy 全般 | [799901](https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker) |
| **Mapcraft (Anima v1)** | `mapcraft_anima_v1.safetensors` | 0.45 | Anima checkpoint 使用時 | [799901](https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker) |
| **Topdown Sci-Fi** | `Topdown_Map_Assets_SciFi.safetensors` | 0.50 | cyberpunk, scifi | [815019](https://civitai.com/models/815019/topdown-map-assets-sci-fi) |
| **Fantasy Map Heavy** | `Fantasy_Map_Heavy.safetensors` | 0.55 | fantasy, postapoc 転用 | [382959](https://civitai.com/models/382959/fantasy-map) |
| **DnD Battlemaps Generator** | `DnD_Battlemaps_Generator.safetensors` | 0.65 | 戦術ゾーン | [2164519](https://civitai.com/models/2164519/dnd-battlemaps-generator) |
| **LargeFantasyCityMap** | `LargeFantasyCityMap.safetensors` | 0.70 | 大規模都市 | [694762](https://civitai.com/models/694762/largefantasycitymap) |

- **Illustrious 地図:** `mapcraft_il_v1` + Illustrious XL checkpoint（推奨）
- **Anima 地図:** `mapcraft_anima_v1` + Anima checkpoint（現行 SDXL Canny workflow は要調整）
- Flux 版は現行 workflow 非対応
- Mapcraft trigger: `mapcraft, battle map, top-down view, from above, no humans`
- **避ける:** キャラ LoRA、円形フレーム LoRA、天体図 LoRA、文字入り地図 LoRA

---

## 5. LoreRelay 推奨プロンプトテンプレート

プレースホルダ: `{worldName}` `{theme}` `{biomeSummary}`

### 5.1 Regional RPG map（デフォルト）

**Positive:**

```text
top-down fantasy RPG world map of {worldName}, regional campaign cartography on aged parchment,
orthographic bird eye view, tabletop roleplaying game map, distinct terrain zones and landmasses,
hand-inked coastlines, forest patches, desert basins, mountain ridge hatching, swamp basins,
winding dirt roads and trade routes between settlements, river strokes, lake shores,
ruins and shrine markers as small map symbols, warm sepia ink wash, antique atlas page,
readable macro geography, no labels, no typography, no UI frame,
{theme} setting, featuring {biomeSummary},
masterpiece, best quality, highly detailed regional map illustration
```

**Negative（コア）:**

```text
star chart, astrolabe, zodiac wheel, celestial diagram, astronomical map, magic circle,
summoning circle, ritual circle, radial symmetry, circular diagram, radial grid,
compass rose centerpiece, ornate mandala, spherical globe, planet in space,
abstract diagram, infographic, flowchart, node graph visualization,
satellite photo, GPS map, modern road atlas, neon, sci-fi HUD,
isometric city, character portrait, anime face, creature close-up,
3d render, photorealistic photograph, text, letters, words, watermark, signature,
lowres, worst quality, blurry
```

### 5.2 Fantasy parchment（装飾少なめ）

```text
antique parchment fantasy map, {worldName}, hand-drawn ink cartography,
regional provinces as painted terrain washes, subtle hill shading, coast silhouettes,
trail lines linking towns, medieval fantasy atlas, sepia tones, no captions
```

### 5.3 Top-down cartography（写実寄り禁止）

```text
painted top-down cartography, fantasy world regional map, strategy game overworld,
clear land versus water shapes, biome-colored regions, path network visible,
illustrated map rather than photograph, no border ornament
```

---

## 6. ラベル分離設計（実装済み方針）

| 要素 | 生成元 | 表示 |
|------|--------|------|
| 地形・道路・海岸 | ComfyUI 画像 | `<img id="world-cartography-img">` |
| 地点マーカー | `buildCartographyPinPositions()` | `.world-map-pin`（📍、`leftPct`/`topPct`） |
| 地域名 | `buildCartographyRegionLabels()` | `.world-map-region-label`（`region.name`） |
| 現在地強調 | `currentLocationId` | `.is-current` on pin |

**プロンプトに必ず含める:** `no labels, no typography, no text`

画像内に文字を描かせると、座標 overlay と二重表示・誤読の原因になる。

---

## 7. layout PNG → ControlNet 最適手順

1. `world_forge.json` の各 region に整数 `x`,`y`,`biome` を入れる（`CARTOGRAPHY_DESIGN.md` の LLM プロンプト参照）
2. `connectedTo` を双方向で整合させる（道路グラフ）
3. Layout 生成:

```powershell
python scripts/render_cartography_layout.py C:\path\to\world_forge.json C:\path\to\world_map.layout.png --size 1024
```

4. **目視確認:** 色付き円の中心が期待座標か、道路が `connectedTo` どおりか
5. ComfyUI で layout を Canny → ControlNet へ
6. 出力 `world_map.png` をワークスペース直下に配置
7. Webview の Parchment モードでピン＋地域ラベル overlay を確認

### Layout 品質チェックリスト

- [ ] 道路が細すぎない（太い黒線）
- [ ] 地域に輪郭リングがある
- [ ] 円形が「星図の同心円」状に配置されていない（JSON 座標を散らす）
- [ ] `sea` が端に、`coast` が海隣接

---

## 8. ComfyUI ワークフロー改善案

### 8.1 現行（同梱・更新済み）

`comfyui/workflow_cartography_sdxl_canny.json`

- KSampler: steps **28**, cfg **6.0**, `dpmpp_2m` + `karras`
- ControlNet SDXL Canny, strength **0.88**, end **1.0**
- Canny: low **0.28**, high **0.62**

### 8.2 推奨（中級）

**Dual conditioning:**

```text
[Load layout]
   ├─► Canny ──► ControlNetApply (strength 0.90)  … 道路・輪郭
   └─► (optional) Tile blur ──► ControlNetApply (strength 0.20) … 紙質のみ
```

### 8.3 推奨（上級・Lineart）

1. `render_cartography_layout.py --mode lineart` で白地 + 黒線のみ PNG を追加出力（将来）
2. `LineArtPreprocessor` → SDXL **Lineart** ControlNet
3. strength 0.85、プロンプトから `sepia wash` を弱めて線の明瞭さ優先

### 8.4 Flux 用（別ファイル化推奨）

- Checkpoint: `flux1-dev.safetensors`
- ControlNet: `flux1-canny-dev.safetensors`
- 解像度 1024、steps 20–24、cfg 3.5–4.5（Flux は低 CFG）

---

## 9. 実装に反映する設定値（一覧）

### 環境変数（`comfyui_generate_cartography.py`）

| 変数 | 推奨値 | 説明 |
|------|--------|------|
| `TA_MODE` | `illustrious` | プロンプトプリセット |
| `TA_CONTROL_STRENGTH` | `0.88` | 地理拘束（0.85–0.92） |
| `TA_CFG` | `6.0` | 高すぎると装飾へドリフト |
| `TA_STEPS` | `28` | 24–32 |
| `TA_WIDTH` / `TA_HEIGHT` | `1024` | SDXL 正方形 |
| `TA_LAYOUT_MODE` | **`voronoi`**（既定） | 円形 blob の代わりに Voronoi 地域分割。`lineart` は白地＋黒線（direct workflow） |
| `TA_LAYOUT_MODE` | `full` / `roads` | レガシー（非推奨） |
| `TA_FORCE_LAYOUT` | `1` | layout PNG を毎回再生成 |
| `TA_CHECKPOINT` | 手元の Illustrious XL 名 | `List Image Models` で確認 |
| `TA_CONTROL_NET` | SDXL Canny の正確なファイル名 | 例: `diffusers_xl_canny_full.safetensors` |
| `TA_LORA` | （任意）LoRA ファイル名 | 例: `mapcraft_il_v1.safetensors` — [推奨一覧](CARTOGRAPHY_RECOMMENDED_LORAS.md) |
| `TA_LORA_WEIGHT` | `0.45` | ControlNet 併用時は 0.4〜0.5 推奨 |

### VS Code 設定（ユーザー側 — Git 不要）

地図 LoRA の既定は **User Settings** に書く（同梱デフォルトは空）:

```json
{
  "textAdventure.imageGen.controlNet": "diffusers_xl_canny_full.safetensors",
  "textAdventure.imageGen.checkpoint": "IL\\prefectIllustriousXL_v8.safetensors",
  "textAdventure.cartography.lora": "mapcraft_il_v1.safetensors",
  "textAdventure.cartography.loraWeight": 0.45
}
```

### チューニング早見表

| 症状 | 調整 |
|------|------|
| 星図・魔法陣になる | ネガティブ強化 + positive から `compass rose` 削除 |
| 地形が写真風 | `satellite photo` を neg に、`illustrated map` を pos に |
| 地理がズレる | `TA_CONTROL_STRENGTH` ↑、layout 道路を太く |
| 平坦・単調 | strength を 0.82 程度に ↓、CFG 6.5 |
| 道路が消える | Canny low_threshold ↓、layout 線を太く |

---

## 10. コード上の参照箇所

| ファイル | 役割 |
|----------|------|
| `src/cartographyLayoutCore.ts` | プロンプトテンプレート、ピン・地域ラベル座標 |
| `scripts/render_cartography_layout.py` | layout PNG（biome + 道路 + 輪郭） |
| `scripts/comfyui_generate_cartography.py` | ComfyUI キュー、環境変数オーバーライド |
| `comfyui/workflow_cartography_sdxl_canny.json` | SDXL + Canny ノード契約 |
| `webview/modules/85-world.js` | ピン・地域ラベル overlay |

---

## 11. 参考リンク

- [Mapcraft — The Ultimate TTRPG Mapmaker](https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker) — LoreRelay 第一推奨 LoRA
- [`CARTOGRAPHY_RECOMMENDED_LORAS.md`](CARTOGRAPHY_RECOMMENDED_LORAS.md) — ComfyUI 向け推奨 LoRA 調査まとめ
- [Civitai ControlNet Guide](https://education.civitai.com/civitai-guide-to-controlnet/) — Canny / Lineart / Tile の違い
- [ComfyUI SD3.5 Canny Example](https://www.comfy.org/workflows/sd3.5_large_canny_controlnet_example-0bb057fd76e3/) — ワークフロー構造参考
- Reddit r/dndai ComfyUI map process — D&D マップ + ControlNet 事例