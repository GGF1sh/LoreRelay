# ドリフトライト — 54日の配電 — 画像プロンプト

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

## ① ユエ 立ち絵

**ComfyUI positive:**
```
1woman, 40s, station commander, severe grey uniform with worn cuffs, black hair pulled back tight, exhausted composed expression, dark circles under eyes, standing in a dim command office, faint holographic readouts reflected on her face, cold blue-grey lighting, upper body portrait, detailed face, cinematic sci-fi illustration, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

薄暗い管制室に立つ40代の女性ステーション長を描いてください。すり切れた袖口の灰色の制服、きつく後ろで束ねた黒髪、目の下の隈、疲れているが崩れていない表情。顔にホログラム表示の淡い光が反射している。冷たい青灰色の照明。映画的なSF風の胸像イラスト。

---

## ② トビアス 立ち絵

**ComfyUI positive:**
```
1man, 30s, station maintenance chief, stained work coveralls with a torn-off name patch, stubble, restless intense eyes, grease on hands, standing in a cramped utility corridor lined with conduits, harsh single overhead light, sci-fi industrial interior, upper body portrait, detailed face, cinematic illustration, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

配管が並ぶ狭い整備通路に立つ30代の男性整備班長を描いてください。汚れたつなぎ、剥がした名札の跡、無精髭、落ち着かない鋭い目、油で汚れた手。頭上の裸電球ひとつの強い光。工業的なSF内装。映画的な胸像イラスト。

---

## ③ 背景：到着ロビー

**ComfyUI positive:**
```
a space station arrival lobby in power rationing, only one in three ceiling lights working, stranded passengers blankets and luggage on the floor, sealed passenger gate with a warning display, notice board with printed power allocation lists, worn plastic seating, cold dim lighting, no people, cinematic sci-fi interior, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

節電中の宇宙ステーション到着ロビーを人物なしで描いてください。天井灯は三本に一本しか点いていない。床には足止めされた乗客の毛布と荷物。閉鎖された乗客ゲートに警告表示。配電表が貼られた掲示板、擦り切れた樹脂の椅子。冷たく薄暗い照明。映画的なSF内装の横長イラスト。

---

## ④ 背景：封鎖されたD区画隔壁

**ComfyUI positive:**
```
a sealed emergency bulkhead in a space station, heavy scoring and scratch marks on the inner surface, hazard striping, frost forming around the seal, emergency red strip lighting, condensation on the deck plating, abandoned corridor, no people, ominous, cinematic sci-fi, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

宇宙ステーションの封鎖された緊急隔壁を人物なしで描いてください。内側の面に深い引っかき傷が多数。危険標識のストライプ、密閉部に霜、非常用の赤いライン照明、床板の結露。放棄された通路。不穏で映画的なSF横長イラスト。

---
