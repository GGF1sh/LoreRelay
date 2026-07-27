# 八日目の隔離線 — 画像プロンプト

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

## ① 田代 恭介 立ち絵

**ComfyUI positive:**
```
1man, 50s, japanese former city hall disaster official, thinning hair, glasses with tape repaired frame, grey windbreaker over a wrinkled dress shirt, ID lanyard, holding a clipboard of handwritten rules, standing at the entrance of a school gymnasium shelter, exhausted but rigidly composed, overcast morning light, photorealistic illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

日本の元市役所防災担当、50代の男性を描いてください。薄くなった髪、テープで補修した眼鏡、皺のワイシャツの上に灰色のウィンドブレーカー、首から下げたIDカード、手書きの規則を挟んだクリップボードを持っている。学校の体育館避難所の入口に立ち、疲れ切っているが姿勢は崩していない。曇りの朝の光。写実的な胸像イラスト。

---

## ② 陸 ナオ 立ち絵

**ComfyUI positive:**
```
1woman, 30s, japanese nurse in an emergency shelter, hair tied back messily, dark circles under calm steady eyes, wrinkled scrubs with a cardigan over them, stethoscope around neck, seated beside a portable radio in a school nurse office, weak fluorescent light, medical supplies rationed on the desk, photorealistic illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

避難所の日本人看護師、30代の女性を描いてください。雑に後ろで束ねた髪、目の下の隈、落ち着いた静かな目、皺の寄ったスクラブの上にカーディガン、首に聴診器。学校の保健室で携帯無線機の脇に座っている。弱い蛍光灯、机の上に配給制の医療品。写実的な胸像イラスト。

---

## ③ 背景：体育館の避難所

**ComfyUI positive:**
```
a japanese school gymnasium converted into an emergency shelter, rows of cardboard partitions and blankets on the floor, a handwritten rules poster taped to the stage wall, a ration queue line marked in tape on the floor, high windows with grey overcast light, basketball hoops still raised, quiet and orderly, no people, photorealistic illustration, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

避難所になった日本の学校の体育館を人物なしで描いてください。床に段ボールの間仕切りと毛布が並び、舞台の壁に手書きの規則の模造紙。床にテープで引かれた配給の待機列。高窓から灰色の曇り空の光。バスケットゴールは上げたまま。静かで整然としている。写実的な横長イラスト。

---

## ④ 背景：市境の隔離線（遠景）

**ComfyUI positive:**
```
a military quarantine line seen from a distance across an abandoned japanese provincial city, concrete barriers and razor wire along a river bridge, floodlight towers, armored vehicles in silhouette, empty streets with stopped cars in the foreground, overcast grey sky, no people visible, oppressive scale, photorealistic illustration, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

放棄された日本の地方都市越しに遠景で見た、軍の隔離線を描いてください。河にかかる橋沿いのコンクリート障壁と有刺鉄線、投光器の塔、シルエットの装甲車。手前は停止した車が残る無人の街路。曇天の灰色の空。人影は見えない。圧迫感のあるスケール。写実的な横長イラスト。

---
