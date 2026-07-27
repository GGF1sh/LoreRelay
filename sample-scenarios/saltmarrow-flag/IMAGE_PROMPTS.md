# ソルトマロウの旗 — 白い海域 — 画像プロンプト

ComfyUI と ChatGPT / Grok / Gemini のどちらにも使えるよう、各画像に positive（ComfyUI用）と自然文（チャットAI用）を併記しています。

## 共通設定（全画像共通）

**ComfyUI 共通 negative:**
```
lowres, bad anatomy, bad hands, extra digits, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry, text, error, missing fingers, extra limbs, deformed, mutated
```

**ComfyUI 推奨パラメータ:**

| 用途 | 解像度 | steps | cfg | sampler |
|---|---|---|---|---|
| キャラ立ち絵 | 832x1216 | 28 | 6.5 | dpmpp_2m / karras |
| 背景 | 1344x768 | 30 | 7.0 | dpmpp_2m / karras |

---

## ① ドリス 立ち絵

**ComfyUI positive:**
```
1woman, 50s, weathered ship navigator, grey hair braided tight and salt-stained, clouded pale eyes with a distant unfocused gaze, deep sun lines, heavy oiled coat over a striped shirt, one hand resting flat on an unrolled sea chart, standing at a ship stern rail at dusk, sea wind, painterly nautical illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

50代の熟練の女性航海士を描いてください。きつく編んだ塩を吹いた白髪、焦点の合わない白濁した淡い目、深い日焼けの皺、縞のシャツの上に厚い油引きのコート。広げた海図に片手を平らに置き、夕暮れの船尾の手すりの脇に立っている。海風。絵画的な航海物の胸像イラスト。

---

## ② ヤン 立ち絵

**ComfyUI positive:**
```
1man, 30s, ship boatswain and former imperial navy deserter, close-cropped hair, tense jaw, alert impatient eyes, worn canvas shirt with rolled sleeves, rope coiled over one shoulder, standing on a ship deck at dusk, rigging lines behind him, painterly nautical illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

30代の甲板長の男性を描いてください。元帝国海軍の脱走兵。短く刈った髪、強張った顎、苛立ちを含んだ油断のない目、袖をまくった擦り切れた帆布のシャツ、肩に巻いたロープ。夕暮れの甲板に立ち、背後に索具。絵画的な航海物の胸像イラスト。

---

## ③ 背景：自由港カレン 七番桟橋

**ComfyUI positive:**
```
a crowded free port dock at dusk, three different faction banners planted along the pier in blue white and black, moored sailing ships of various sizes, crates and coiled rope, lantern light beginning to show, warm orange sky over dark water, distant island silhouettes, no people, painterly nautical landscape, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

夕暮れの賑わう自由港の桟橋を人物なしで描いてください。青・白・黒の三つの勢力の旗が桟橋沿いに立っている。大小さまざまな帆船が係留され、木箱と巻いたロープ。灯り始めたランタン。暗い水面の上に暖かいオレンジの空、遠くの島影。絵画的な航海物の横長風景画。

---

## ④ 背景：白い海域

**ComfyUI positive:**
```
an uncharted stretch of ocean under a colorless overcast sky, water flat as glass with no horizon line visible, thick pale mist erasing all distance, no birds, no wind, a single dark shape half-submerged far off, unnatural stillness, no people, painterly nautical illustration, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

海図に無い未測量の海域を人物なしで描いてください。色の無い曇天の下、水面はガラスのように平らで水平線が見えない。濃い白い霧が遠景を消している。鳥も風もない。遠くに半ば沈んだ暗い影が一つ。不自然な静止。絵画的な航海物の横長イラスト。

---
