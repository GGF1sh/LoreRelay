# ブラスヘイヴン — 一日四十七秒 — 画像プロンプト

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

## ① オーレリア 立ち絵

**ComfyUI positive:**
```
1woman, 30s, steampunk patent office clerk, dark hair in a severe bun, thin brass-rimmed spectacles, high-collared charcoal uniform with brass buttons, ink-stained fingers, standing behind a brass service window, stacks of stamped documents, warm gaslight, steam pipes in the background, painterly steampunk illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

スチームパンクの特許庁の女性書記官、30代を描いてください。きつく結った黒髪、細い真鍮縁の眼鏡、真鍮ボタンの立襟の炭色の制服、インクで汚れた指。真鍮の窓口カウンターの向こうに立ち、判を押した書類の山。暖かいガス灯の光、背景に蒸気配管。絵画的なスチームパンク調の胸像イラスト。

---

## ② グリム 立ち絵

**ComfyUI positive:**
```
1man, 60s, steampunk pipefitter guild foreman, bald with thick grey side whiskers, heavily scarred and burned hands, oil-stained leather work apron over a rough shirt, brass goggles pushed up on his forehead, standing in a cramped pipe gallery, hot orange boiler light, painterly steampunk illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

スチームパンクの配管工組合の親方、60代の男性を描いてください。禿頭に濃い灰色の頬髯、火傷と古傷だらけの手、粗いシャツの上に油染みた革のエプロン、額に押し上げた真鍮のゴーグル。狭い配管通路に立ち、ボイラーの熱いオレンジの光。絵画的なスチームパンク調の胸像イラスト。

---

## ③ 背景：特許庁 受付広間

**ComfyUI positive:**
```
the grand reception hall of a steampunk patent office, towering brass columns with visible steam risers, a huge wall notice board displaying a cumulative delay counter, ornate service windows, gaslight chandeliers, polished tile floor, faint steam haze near the ceiling, no people, painterly steampunk interior, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

スチームパンクの特許庁の壮大な受付広間を人物なしで描いてください。蒸気管が透けて見える巨大な真鍮の柱、累積遅延を表示する巨大な掲示板、装飾的な窓口、ガス灯のシャンデリア、磨かれたタイル床、天井付近の薄い蒸気。絵画的なスチームパンク内装の横長イラスト。

---

## ④ 背景：〈大時計〉内部

**ComfyUI positive:**
```
the interior mechanism of a colossal steampunk clock tower, enormous interlocking brass gears three stories tall, pressure gauges and governor weights, catwalks and ladders, escaping steam jets, one gear tooth visibly worn, dramatic shafts of light from high windows, no people, painterly steampunk illustration, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

巨大なスチームパンクの時計塔の内部機構を人物なしで描いてください。三階分の高さがある噛み合った真鍮の歯車群、圧力計と調速機の錘、キャットウォークと梯子、噴き出す蒸気。歯車の歯が一箇所だけ目に見えて摩耗している。高窓からの劇的な光条。絵画的なスチームパンク調の横長イラスト。

---
