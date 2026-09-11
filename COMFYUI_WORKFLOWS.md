# ComfyUI Workflows (Bundled)

LoreRelay は、用途別に選べる **API 形式** の ComfyUI ワークフローを同梱します。  
一覧の正本は [`comfyui/templates.json`](comfyui/templates.json) です。

これらはユーザーの PC スペック診断ではなく、**情景・立ち絵・地図** を切り替えるためのテンプレートです。checkpoint（Illustrious / Pony / SDXL / SD1.5）は自分の ComfyUI にあるファイル名を指定します。

## どれを選ぶか

| 使いたいもの | テンプレート | ファイル | 既定サイズ | mode の目安 |
| --- | --- | --- | --- | --- |
| 普通の情景 | 情景・SDXL・正方形 | `comfyui/workflow_sdxl_1024.json` | 1024×1024 | `illustrious` または `pony` |
| 人物・立ち絵 | 立ち絵・SDXL・縦長 | `comfyui/workflow_sdxl_portrait.json` | 896×1152 | 同上 |
| 場所の横構図 | 情景・SDXL・横長 | `comfyui/workflow_sdxl_landscape.json` | 1152×896 | 同上 |
| 広い風景 | 情景・SDXL・パノラマ | `comfyui/workflow_sdxl_wide.json` | 1536×640 | 同上 |
| 軽い確認 | 情景・SD1.5・正方形 | `comfyui/workflow_api.json` | 512×512 | `standard` |
| 世界地図 | 世界地図・SDXL・Canny | `comfyui/workflow_cartography_sdxl_canny.json` | 1024×1024 | Cartography スクリプト |
| 世界地図（Canny なし） | 世界地図・SDXL・直接 | `comfyui/workflow_cartography_sdxl_direct.json` | 1024×1024 | Cartography スクリプト |

縦長・横長・パノラマの画素数は、ComfyUI 公式 SDXL 例（1024×1024 と同画素、または 1536×640）に合わせています。

Illustrious と Pony は **同じ SDXL グラフ** に checkpoint と `mode` を差し替えます。Flux / Qwen / Z-Image 用の別グラフは、現行のシーン生成ランナーがまだ注入できないため同梱していません。

## 設定

1. ComfyUI（または Stability Matrix）を `http://127.0.0.1:8188` で起動する。
2. **LoreRelay: List Image Models** で checkpoint 名をコピーする。
3. ワークスペースの `image_gen_config.json`、または VS Code 設定で:

```json
{
  "mode": "illustrious",
  "checkpoint": "YOUR_CHECKPOINT.safetensors",
  "workflowPath": "C:\\\\path\\\\to\\\\LoreRelay\\\\comfyui\\\\workflow_sdxl_portrait.json",
  "steps": 28,
  "cfg": 7
}
```

`workflowPath` を立ち絵テンプレートにすると縦構図、`workflow_sdxl_1024.json` にすると正方形情景になります。`mode` はプロンプトプリセットです（`illustrious` / `pony` / `natural` / `standard`）。グラフそのものではありません。

サイズを設定の `width` / `height` で上書きすると、テンプレートの既定サイズよりそちらが優先されます。テンプレートの構図を使いたいときは width/height を 0 のままにするか省略します。

## 地図

[`docs/CARTOGRAPHY_COMFYUI.md`](docs/CARTOGRAPHY_COMFYUI.md)。任意 LoRA: [`docs/CARTOGRAPHY_RECOMMENDED_LORAS.md`](docs/CARTOGRAPHY_RECOMMENDED_LORAS.md)。

```powershell
python scripts/render_cartography_layout.py .\world_forge.json .\world_map.layout.png
python scripts/comfyui_generate_cartography.py .\world_forge.json .\output
```

## CLI / GM スクリプト

`comfyui_generate.py` は次を受けます。

- `TA_WORKFLOW` — 上の JSON へのパス
- `TA_CHECKPOINT`, `TA_STEPS`, `TA_CFG`, `TA_WIDTH`, `TA_HEIGHT`, `TA_MODE`

未指定時の既定: `TextAdventureGMSkill/scripts/workflow_api.json`（`comfyui/workflow_api.json` と同じグラフ）。

シーン生成テンプレートは、ランナーが次のノード ID に書き込みます。

| ID | 役割 |
| --- | --- |
| 3 | KSampler（steps / cfg / seed / sampler） |
| 4 | CheckpointLoaderSimple |
| 5 | EmptyLatentImage（width / height） |
| 6 | Positive `CLIPTextEncode` |
| 7 | Negative `CLIPTextEncode` |

自作 API グラフを足す場合も、この契約に合わせます。

## まだ同梱していないもの

次は公式 ComfyUI テンプレートはありますが、LoreRelay のシーン生成注入（上記ノード契約）と Media Profile がまだ対応していません。ファイルだけ置いても動きません。

- Flux.1 / Flux.2 / Z-Image / Qwen-Image の T2I
- Qwen-Image-Edit、Flux Kontext などの編集専用グラフ
- Partner API（Nano Banana、Grok Imagine 等）

## トラブル

- **Checkpoint not found** — List Image Models の名前と完全一致させる。
- **Sampler / scheduler warnings** — 未対応キーは無視する。
- 生成が重いとき — まず `workflow_api.json`（512）で経路を確認してから SDXL テンプレートへ戻す。
