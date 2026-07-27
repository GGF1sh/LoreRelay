# 奏高校 二年目の春 — 文化総合部 — 画像プロンプト

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

## ① 芹沢 陽 立ち絵

**ComfyUI positive:**
```
1boy, japanese high school third year student, tall lanky build, messy dark hair, sleepy half-lidded eyes, easygoing smile, navy gakuran uniform worn loosely, leaning back on a chair by a window in an old wooden classroom, warm afternoon sunlight, anime illustration style, soft colors, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

古い木造校舎の窓際の椅子にもたれた、日本の高校3年生男子を描いてください。長身で痩せ型、くしゃっとした黒髪、眠たげな半目、気の抜けた笑み、着崩した紺の学ラン。午後の暖かい日差し。アニメ調のやわらかい色彩の胸像イラスト。

---

## ② 東雲 みなも 立ち絵

**ComfyUI positive:**
```
1girl, japanese high school second year student, neat shoulder-length black hair, serious composed expression, navy sailor uniform worn correctly, holding a clipboard and a mechanical pencil, standing at a desk covered with ledgers and receipts, old classroom, warm afternoon light, anime illustration style, soft colors, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

日本の高校2年生の女子生徒を描いてください。整えた肩までの黒髪、真面目で落ち着いた表情、きちんと着た紺のセーラー服。クリップボードとシャープペンを持ち、帳簿と領収書が広がった机の前に立っている。古い教室、午後の暖かい光。アニメ調のやわらかい胸像イラスト。

---

## ③ 背景：文化総合部 部室

**ComfyUI positive:**
```
a small club room in an old wooden japanese school building, afternoon sunlight through tall windows, mismatched desks, a kettle and mugs on a shelf, a large handwritten paper on the wall, cardboard boxes of old club materials, dust in the light, cozy and slightly abandoned, no people, anime background art, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

日本の古い木造校舎にある小さな部室を人物なしで描いてください。背の高い窓から午後の日差し。ちぐはぐな机、棚の上のやかんとマグ、壁に貼られた手書きの大きな紙、古い部の資料が入った段ボール箱。光の中の埃。居心地がよく、少し打ち捨てられた雰囲気。アニメ調の背景画、横長。

---

## ④ 背景：旧校舎の廊下（夕方）

**ComfyUI positive:**
```
a corridor in an old japanese school building at golden hour, worn wooden floor reflecting orange light, row of tall windows, notice boards with faded printouts, a stairwell at the far end, long shadows, quiet and nostalgic, no people, anime background art, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

夕方の日本の古い校舎の廊下を人物なしで描いてください。オレンジ色の光を反射する擦れた板張りの床、並んだ背の高い窓、色あせた掲示物の掲示板、突き当たりの階段。長く伸びた影。静かで郷愁のある雰囲気。アニメ調の背景画、横長。

---
