# 薄墨番所 — 暮れ六つの入れ替わり — 画像プロンプト

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

## ① 佐伯 十郎太 立ち絵

**ComfyUI positive:**
```
1man, 50s, edo period japanese samurai official, greying topknot, weathered stern face, plain dark kimono and hakama, seated formally on a wooden floor beside a sunken hearth, katana resting on a stand behind him, dim firelight from below, sparse traditional interior, ukiyo-influenced painterly illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

江戸時代の五十代の武士を描いてください。白髪混じりの髷、厳しく風雪を経た顔、質素な暗色の着物と袴。囲炉裏の脇に正座し、背後の刀掛けに刀。下からの弱い火明かり。簡素な和室。浮世絵の趣を持つ絵画的な胸像イラスト。

---

## ② 綾 立ち絵

**ComfyUI positive:**
```
1woman, mid 20s, edo period former shrine maiden turned freelance medium, long black hair loosely tied, sharp knowing eyes, faint smirk, worn indigo kimono with a red inner collar, counting coins in one palm, seated on the raised edge of an earthen floor, evening light from a doorway, ukiyo-influenced painterly illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

江戸時代の二十代半ばの女性を描いてください。元巫女で今は口寄せを生業にしている。ゆるく結った長い黒髪、聡明で鋭い目、微かな不敵な笑み、着古した藍の着物に赤い襦袢の襟。片手で銭を数え、土間の框に腰かけている。戸口からの夕明かり。浮世絵の趣を持つ絵画的な胸像イラスト。

---

## ③ 背景：薄墨宿の街道（暮れ六つ）

**ComfyUI positive:**
```
an edo period japanese post town street at dusk, wooden inns with closed shutters, paper lanterns just being lit, empty road, distant mountains fading into blue evening haze, a stone jizo statue at the roadside, no people, quiet and uneasy, ukiyo-influenced painterly landscape, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

江戸時代の宿場町の街道を、日暮れ時に人物なしで描いてください。板戸を閉めた旅籠が並び、提灯に火が入りはじめている。人けのない道、青い夕靄に沈む遠山、道端の石地蔵。静かで不穏な空気。浮世絵の趣を持つ絵画的な横長風景画。

---

## ④ 背景：番所 土間

**ComfyUI positive:**
```
the interior of a small edo period guard station, earthen floor and a raised wooden platform, a sunken hearth with glowing embers, no pot hanging, a sword stand, official documents stacked in a corner, single paper lantern, deep shadows, austere and cold, no people, ukiyo-influenced painterly illustration, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

江戸時代の小さな番所の内部を人物なしで描いてください。土間と板間、熾火だけの囲炉裏（鍋はかかっていない）、刀掛け、隅に積まれた御用書類、行灯ひとつ。深い影。厳めしく冷たい空気。浮世絵の趣を持つ絵画的な横長イラスト。

---
