# ドライ・ヴァーディクト — 測量士が来るまで — 画像プロンプト

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

## ① ルシール 立ち絵

**ComfyUI positive:**
```
1woman, 40s, saloon owner in the american old west, auburn hair pinned up, shrewd appraising eyes, faint practiced smile, dark green period dress with a fitted bodice, standing behind a scarred wooden bar, bottles and oil lamps behind her, warm amber interior light, dusty air, painterly western illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

アメリカ西部開拓時代の酒場の女主人、40代の女性を描いてください。結い上げた赤褐色の髪、人を値踏みする聡明な目、慣れた薄い笑み、体に沿った濃緑のドレス。傷だらけの木のカウンター越しに立ち、背後には酒瓶とオイルランプ。琥珀色の暖かい室内光と埃っぽい空気。絵画的な西部劇風の胸像イラスト。

---

## ② エズラ 立ち絵

**ComfyUI positive:**
```
1man, late 30s, company enforcer in the american old west, clean pressed shirt and dark vest, polished gunbelt worn low, neatly trimmed beard, calm courteous expression, wide brim hat, standing in bright harsh midday sun on a dusty main street, painterly western illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

アメリカ西部開拓時代の、鉱山会社に雇われた私兵の頭、30代後半の男性を描いてください。清潔なシャツと濃色のベスト、低い位置に磨いたガンベルト、整えた顎髭、落ち着いた礼儀正しい表情、つば広の帽子。埃っぽいメインストリートの強い真昼の光。絵画的な西部劇風の胸像イラスト。

---

## ③ 背景：メインストリート

**ComfyUI positive:**
```
the main street of a dying american old west mining town at midday, twenty wooden false-front buildings, six with fresh boards nailed over the windows, dust blowing down the empty street, distant dry mountains, a leaning saloon sign, hard sunlight and short shadows, no people, painterly western landscape, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

衰えつつあるアメリカ西部の鉱山町のメインストリートを、真昼に人物なしで描いてください。二十棟ほどの木造の張りぼて建築、うち六棟は窓に真新しい板が打ちつけられている。無人の通りを吹き抜ける埃、遠くの乾いた山、傾いた酒場の看板。強い日差しと短い影。絵画的な西部劇風の横長風景画。

---

## ④ 背景：無人の保安官事務所

**ComfyUI positive:**
```
the interior of an abandoned old west sheriff office, empty desk with scattered papers, a dusty hat hanging on a wall hook, an open empty jail cell in the back, sunlight in bars through a shuttered window, cobwebs, a tin star lying face down on the desk, no people, painterly western illustration, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

打ち捨てられた西部の保安官事務所の内部を人物なしで描いてください。書類が散らばった空の机、壁のフックに掛かった埃だらけの帽子、奥に開いたままの空の留置房、鎧戸の隙間から差し込む縞状の光、蜘蛛の巣、机の上に伏せて置かれたブリキの星のバッジ。絵画的な西部劇風の横長イラスト。

---
