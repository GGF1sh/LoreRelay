# Cartography — ComfyUI 推奨 LoRA（RPG ゾーンマップ）

ComfyUI で LoreRelay の **RPG ゾーンマップ**（`world_forge.json` → Voronoi layout → SDXL Canny）を生成するときの、**推奨 LoRA 調査結果**です。

関連: [`CARTOGRAPHY_COMFYUI.md`](CARTOGRAPHY_COMFYUI.md) · [`CARTOGRAPHY_MAP_GENERATION_GUIDE.md`](CARTOGRAPHY_MAP_GENERATION_GUIDE.md) · [`CARTOGRAPHY_WORKFLOW_CONTRACT.md`](CARTOGRAPHY_WORKFLOW_CONTRACT.md)

**前提:** Illustrious XL / SDXL + **Canny ControlNet** 対応を優先。Anima / Flux / Wan / SD1.5 専用 LoRA は現行 workflow では除外しています。

**重要:** LoRA は **自動適用されません**。試すときだけ `TA_LORA` / `TA_LORA_WEIGHT` を手動設定してください。地形の正確性は **ControlNet Canny + layout** が担います。

---

## 1. 第一推奨 — Mapcraft

| 項目 | 内容 |
|------|------|
| **名前** | Mapcraft: The Ultimate TTRPG Mapmaker |
| **URL** | [Civitai 799901](https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker) |
| **種別** | LoRA |
| **base model** | SDXL / Illustrious（**`mapcraft_il_v1.safetensors`**） |
| **weight** | 0.4〜0.5（ControlNet 併用時は **≤0.5** 推奨） |
| **トリガー** | `mapcraft, battle map, top-down view, from above, no humans` |

LoreRelay の Cartography では **Illustrious 版**（`mapcraft_il_v1.safetensors`）を第一推奨とします。fantasy 〜 scifi まで幅広く使え、Civitai 上でも TTRPG トップダウン地図向けの評価が最も高いです。

**注意:** Civitai からダウンロードしたファイル名はそのまま ComfyUI の `models/loras`（または Stability Matrix の `I:\AI\Data\Models\Lora`）に置き、`TA_LORA` には **ComfyUI が認識する正確なファイル名**を指定してください。

Anima checkpoint 用の `mapcraft_anima_v1.safetensors` もありますが、現行の SDXL Canny workflow は Illustrious 向けに最適化されています。

---

## 2. テーマ別 最有力候補

| theme | 名前 | URL | 種別 | base model | 採点 | 推奨 weight | 選定理由 | 注意点 |
|-------|------|-----|------|------------|------|-------------|----------|--------|
| fantasy | **Mapcraft** | [799901](https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker) | LoRA | SDXL / Illustrious | 5 | 0.4〜0.5 | TTRPG トップダウン専用。Illustrious 版あり | 地形は Canny + layout 必須 |
| cyberpunk | **Topdown Map Assets — Sci-Fi** | [815019](https://civitai.com/models/815019/topdown-map-assets-sci-fi) | LoRA | SDXL / Pony | 4 | 0.5〜0.7 | サイバーパンク街区・グリッド | Illustrious では weight を下げる |
| postapoc | **Fantasy Map — Heavy**（転用） | [382959](https://civitai.com/models/382959/fantasy-map) | LoRA | SDXL | 4 | 0.5〜0.7 | 廃墟・荒野向けに転用可 | プロンプトで post-apoc を補完 |
| zombie / horror | **Fantasy Map — Heavy**（転用） | [382959](https://civitai.com/models/382959/fantasy-map) | LoRA | SDXL | 3 | 0.5〜0.7 | 感染区域・バリケード表現 | 専用 LoRA は未発見。Mapcraft + プロンプトでも可 |
| scifi | **Topdown Map Assets — Sci-Fi** | [815019](https://civitai.com/models/815019/topdown-map-assets-sci-fi) | LoRA | SDXL | 5 | 0.5〜0.7 | 惑星セクター・コロニー区画 | cyberpunk と同 LoRA |
| modern | **Stylized Setting (Isometric)**（転用） | [118775](https://civitai.com/models/118775/stylized-setting-isometric-sdxl-and-sd15) | LoRA | SDXL | 4 | 0.5〜0.7 | 都市ブロック・道路網 | isometric 寄り。top-down をプロンプトで強調 |

`LoreRelay: Generate World Map Image` 実行時、LoRA 未設定なら Output に **theme に応じたプリセット案**が表示されます（`src/cartographyLoraPresets.ts`）。

---

## 3. 汎用「地図」候補 Top 5（全テーマ横断）

| 順位 | 名前 | URL | base model | 採点 | weight | 一言 |
|------|------|-----|------------|------|--------|------|
| 1 | **Mapcraft** | [799901](https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker) | SDXL / Illustrious | 5 | 0.4〜0.5 | TTRPG 地図専用で最強 |
| 2 | **DnD Battlemaps Generator** | [2164519](https://civitai.com/models/2164519/dnd-battlemaps-generator) | SDXL | 5 | 0.5〜0.8 | 戦術マップ特化。top-down が強い |
| 3 | **Fantasy Map — Heavy** | [382959](https://civitai.com/models/382959/fantasy-map) | SDXL | 4 | 0.5〜0.7 | 手描き風ファンタジー |
| 4 | **Topdown Map Assets — Sci-Fi** | [815019](https://civitai.com/models/815019/topdown-map-assets-sci-fi) | SDXL | 5 | 0.5〜0.7 | サイバーパンク・SF |
| 5 | **LargeFantasyCityMap** | [694762](https://civitai.com/models/694762/largefantasycitymap) | SDXL | 4 | 0.6〜0.8 | 大規模都市マップ |

---

## 4. ComfyUI 運用メモ

### ControlNet + layout でマップを作る流れ

1. `world_forge.json` の `x` / `y` / `connectedTo` から layout PNG を生成（Voronoi 既定）
2. ComfyUI で layout → **Canny** → SDXL Canny ControlNet
3. checkpoint + 任意 LoRA + テーマプロンプトで羊皮紙／トップダウン地図を描画

参考:

- [ComfyUI ControlNet Canny SDXL Workflow](https://civitai.com/models/127802/comfyui-workflow-for-sdxl-and-controlnet-canny) — layout を Canny でガイドする事例
- YouTube: 「ComfyUI SDXL ControlNet Canny Tutorial」— layout → Canny → SDXL の基本フロー

### 推奨パラメータレンジ

| パラメータ | 推奨 | メモ |
|-----------|------|------|
| CFG | 5.5〜7.0 | 地図は低めが安定（既定 6.0） |
| Steps | 28〜35 | 24〜32 でも可 |
| ControlNet strength | **0.85〜0.92** | Canny。地理拘束は高め |
| LoRA weight | **0.4〜0.5** | ControlNet 併用時は高すぎないこと |

### 「星図になる」を避ける negative 例

```text
star chart, celestial map, constellation, astronomical chart, planet, space, galaxy, starry sky, night sky,
magic circle, summoning circle, ritual circle, radial symmetry, circular diagram, compass rose centerpiece
```

---

## 5. LoreRelay 設定（ユーザー側デフォルト推奨）

**リポジトリ同梱のデフォルトは LoRA なし**です。地図で Mapcraft を常に使う場合は **User Settings**（Git に上げない）に書いてください。

### VS Code User Settings（推奨）

```json
{
  "textAdventure.imageGen.checkpoint": "IL\\prefectIllustriousXL_v8.safetensors",
  "textAdventure.imageGen.controlNet": "diffusers_xl_canny_full.safetensors",
  "textAdventure.cartography.lora": "mapcraft_il_v1.safetensors",
  "textAdventure.cartography.loraWeight": 0.45,
  "textAdventure.modelScan.roots": ["I:\\AI\\Data\\Models"]
}
```

優先順位: **`TA_LORA` 環境変数** → **`textAdventure.cartography.lora`** → LoRA なし。

### 環境変数（一時上書き・PowerShell）

```powershell
$env:TA_LORA = "mapcraft_il_v1.safetensors"
$env:TA_LORA_WEIGHT = "0.45"
```

### VS Code から地図生成

1. ComfyUI を `http://127.0.0.1:8188` で起動
2. User Settings に `cartography.lora` を設定（上記）
3. **`LoreRelay: Generate World Map Image`**

Output に `LoRA source: textAdventure.cartography.lora` と出れば設定反映済みです。

---

## 6. テーマ別 positive prompt 1 行例（Mapcraft 使用時）

LoreRelay は `buildCartographyPositivePrompt` で自動組み立てします。手動 ComfyUI やチューニング時の参考:

| theme | 例 |
|-------|-----|
| fantasy | `mapcraft, fantasy map, top-down view, overworld map, detailed terrain, forests mountains rivers, battle map style, high detail` |
| cyberpunk | `mapcraft, cyberpunk city map, top-down tactical map, neon grid, data zones, futuristic district, high detail` |
| postapoc | `mapcraft, post apocalyptic wasteland map, top-down, ruined desert, cracked roads, abandoned buildings, high detail` |
| zombie | `mapcraft, zombie apocalypse quarantine map, top-down, infected zones, barricades, ruined city, dark atmosphere` |
| scifi | `mapcraft, sci-fi planet sector map, top-down colony layout, orbital survey, futuristic structures, high detail` |
| modern | `top-down urban grid map, modern city block, roads highways, detailed buildings, illustrated map, high detail` |

---

## 7. 避ける LoRA

| 種類 | 理由 |
|------|------|
| キャラ / アニメ肖像 LoRA | トップダウンではなくポートレートへ引っ張られる |
| 円形フレーム / 天体図 LoRA | 星図・魔法陣ダイアグラムの原因 |
| 文字入り地図 LoRA | ラベルは HTML overlay に分離（画像内テキスト禁止） |
| Anima / Flux 専用 LoRA | 現行 `workflow_cartography_sdxl_canny.json` 非対応 |

---

## 8. コード上の参照

| ファイル | 役割 |
|----------|------|
| `src/cartographyLoraPresets.ts` | 推奨プリセット定義・theme 別サジェスト |
| `src/cartographyRunner.ts` | 生成時にプリセットヒントを Output 表示 |
| `scripts/comfyui_generate_cartography.py` | `TA_LORA` で LoraLoader ノードを挿入 |

---

## 9. まとめ

- **まず試す LoRA:** [Mapcraft Illustrious v1](https://civitai.com/models/799901/mapcraft-the-ultimate-ttrpg-mapmaker)（`mapcraft_il_v1.safetensors`）
- **地理の正確さ:** LoRA より **Voronoi layout + Canny ControlNet** が本体
- **未発見テーマ**（zombie 専用など）: Mapcraft + テーマプロンプトで代用可能
- **ダウンロード後:** `textAdventure.modelScan.roots` にモデル置き場を登録し、`Scan Local Model Files` で `comfyName` を確認