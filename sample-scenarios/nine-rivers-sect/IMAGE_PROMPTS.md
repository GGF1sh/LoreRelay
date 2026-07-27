# 九江門 — 論剣会まで三月 — 画像プロンプト

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

## ① 柳 青鸞 立ち絵

**ComfyUI positive:**
```
1woman, 25, chinese wuxia senior disciple swordswoman, long black hair tied high with a plain ribbon, sharp cold eyes, faint sweat, pale blue-grey training robes with wide sleeves, straight jian sword held low, standing on worn stone flagstones of a sect training ground, early morning mist, mountains behind, painterly chinese ink-and-color illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

中華武侠の首席弟子、25歳の女剣士を描いてください。素な紐で高く結った長い黒髪、鋭く冷たい目、微かな汗、広袖の淡青灰色の稽古着、下段に構えた直剣（剣）。磨り減った石畳の演武場に立ち、早朝の霧と背後の山々。中国の水墨に淡彩を加えた絵画調の胸像イラスト。

---

## ② 陳 阿七 立ち絵

**ComfyUI positive:**
```
1man, 60s, chinese sect kitchen hand, thinning grey hair and wispy beard, deeply lined face with amused half-closed eyes, patched brown work robe with sleeves tied back, holding a small wine gourd, seated on a low stool beside a rustic outdoor kitchen, morning light, painterly chinese ink-and-color illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

中華武侠の門派の厨房番、60代の男性を描いてください。薄くなった白髪と細い顎髭、深い皺と面白がるような半眼、袖をたくし上げた継ぎ当ての茶色い作務衣、小さな酒瓢を持っている。素朴な屋外厨房の脇の低い腰掛けに座り、朝の光。中国の水墨に淡彩を加えた絵画調の胸像イラスト。

---

## ③ 背景：九江門 演武場

**ComfyUI positive:**
```
a martial arts sect training ground at dawn, worn stone flagstones polished smooth only in the center, moss creeping in from the edges, wooden weapon racks half empty, a sect gate with a faded plaque, nine rivers converging in the misty valley below, distant green mountains, no people, painterly chinese ink-and-color landscape, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

夜明けの武術門派の演武場を人物なしで描いてください。中央だけが磨り減って滑らかになった石畳、縁から侵食する苔、半分空の木製武器架、色あせた扁額の掛かった山門。眼下の霧の谷で九つの河が合流し、遠くに緑の山々。中国の水墨に淡彩を加えた絵画調の横長風景画。

---

## ④ 背景：裏山の墓所

**ComfyUI positive:**
```
an overgrown burial ground on a forested hillside, a dozen weathered stone grave markers with illegible worn inscriptions, thick undergrowth reclaiming the paths, a single small cup of wine placed fresh at one grave, bamboo and mist, twilight, quiet and reverent, no people, painterly chinese ink-and-color landscape, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

木々に覆われた山腹の荒れた墓所を人物なしで描いてください。風化して文字の読めない石碑が十数基、道を覆う下草。一基の墓前にだけ、真新しい酒の杯がひとつ供えられている。竹林と霧、黄昏時。静かで敬虔な空気。中国の水墨に淡彩を加えた絵画調の横長風景画。

---
