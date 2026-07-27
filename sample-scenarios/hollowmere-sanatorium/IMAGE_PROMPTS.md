# ホロウミア療養院 — 夜の点呼 — 画像プロンプト

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

## ① ミセス・オーウェン 立ち絵

**ComfyUI positive:**
```
1woman, 80s, frail elderly former nurse, thin white hair, grey knitted cardigan, seated calmly on a wooden bench in a derelict institutional hallway, hands folded, faint serene smile, looking slightly off-camera down the corridor, weak flashlight light from the side, deep shadows, photorealistic horror, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

荒れた施設の廊下の木のベンチに静かに腰かけた80代の女性を描いてください。細い白髪、灰色のニットカーディガン、膝の上で組んだ手、微かに穏やかな笑み。カメラではなく廊下の奥をわずかに見ている。横からの弱い懐中電灯の光と深い影。写実的なホラー調の胸像。

---

## ② カイ 立ち絵

**ComfyUI positive:**
```
1man, 20s, young streamer, hoodie and cap, action camera on a chest mount, wide adrenaline-bright eyes, forced grin, holding a phone as a light source lighting his face from below, dark decayed corridor behind him, harsh underlight, photorealistic horror, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

20代の配信者の男性を描いてください。パーカーとキャップ、胸元にアクションカメラ。アドレナリンで見開いた目と作り笑い。スマホを光源にして下から顔を照らしている。背後は暗く朽ちた廊下。強いアンダーライト。写実的なホラー調の胸像。

---

## ③ 背景：受付ホール

**ComfyUI positive:**
```
the reception hall of an abandoned 1950s sanatorium at night, peeling wallpaper, scattered blank intake forms on the floor, a dark wooden reception counter, rain streaming down tall windows, single flashlight beam cutting the dark, dust and damp, no people, photorealistic horror, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

1950年代の廃療養院の受付ホールを夜、人物なしで描いてください。剥がれた壁紙、床に散乱した空白の受付票、暗い木の受付カウンター、背の高い窓を流れる雨。暗闇を切る懐中電灯の光条ひとつ。埃と湿気。写実的なホラー調の横長イラスト。

---

## ④ 背景：夜の廊下

**ComfyUI positive:**
```
a long institutional corridor in an abandoned sanatorium at night, identical closed doors receding into darkness, wheelchair overturned halfway down, faint moonlight through a far window, water stains on the ceiling, absolute stillness, no people, photorealistic horror, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

廃療養院の長い廊下を夜、人物なしで描いてください。同じ形の閉じた扉が暗闇の奥へ連なる。途中に横倒しの車椅子。遠くの窓から微かな月光。天井の水染み。完全な静止。写実的なホラー調の横長イラスト。

---
