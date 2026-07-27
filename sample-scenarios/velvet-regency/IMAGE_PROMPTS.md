# ヴェルヴェット摂政期 — 灯明の儀まで三十日 — 画像プロンプト

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

## ① マルグリット 立ち絵

**ComfyUI positive:**
```
1woman, 60s, royal court chamberlain, silver hair in a precise low chignon, unreadable composed expression, high-necked black velvet gown with a single silver chain of office, hands folded, standing in a warm firelit antechamber, heavy tapestries behind her, candlelight, painterly courtly illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

王宮の侍従長、60代の女性を描いてください。低い位置にきっちり結った銀髪、読み取れない静かな表情、詰襟の黒いベルベットのドレスに銀の職章の鎖ひとつ、前で組んだ手。暖炉の火が灯る控えの間に立ち、背後に厚いタペストリー。蝋燭の光。絵画的な宮廷風の胸像イラスト。

---

## ② セヴラン 立ち絵

**ComfyUI positive:**
```
1man, 28, young nobleman regent, dark wavy hair, earnest open expression, deep blue doublet with slightly outdated silver embroidery at the cuffs, standing by a tall arched window, cold daylight on one side of his face and warm firelight on the other, painterly courtly illustration, upper body portrait, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

28歳の若い貴族の摂政を描いてください。黒い波打つ髪、真っ直ぐで開けた表情、袖口の銀刺繍がやや古い型の濃紺のダブレット。背の高いアーチ窓の脇に立ち、顔の片側に冷たい外光、もう片側に暖炉の暖かい光が当たっている。絵画的な宮廷風の胸像イラスト。

---

## ③ 背景：東翼 控えの間

**ComfyUI positive:**
```
a royal palace antechamber, five heraldic banners hung in a perfectly even row at identical height, a large fireplace with a steady fire, tall arched windows with heavy drapes, polished parquet floor, upholstered chairs against the wall, a closed door to an inner chamber, no people, painterly courtly interior, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

王宮の控えの間を人物なしで描いてください。五つの家紋の旗が完全に等間隔・同じ高さで並んで掛かっている。安定した火の入った大きな暖炉、厚いカーテンの掛かった背の高いアーチ窓、磨かれた寄木の床、壁際の張り布の椅子、奥の間へ続く閉じた扉。絵画的な宮廷内装の横長イラスト。

---

## ④ 背景：王の寝室（外から）

**ComfyUI positive:**
```
a dim royal bedchamber seen from the doorway, a canopied bed with a still figure under embroidered covers, an untouched cup of medicine on a side table, drawn curtains with one thin blade of daylight, physicians instruments laid out in perfect order, dust motes, oppressive stillness, no people standing, painterly courtly illustration, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

戸口から見た薄暗い王の寝室を描いてください。刺繍の掛布の下に動かない人影のある天蓋付きの寝台、脇机に手つかずの薬湯の器、閉じたカーテンから漏れる一筋の細い光、完璧に並べられた医療器具、舞う埃。重苦しい静止。立っている人物は描かない。絵画的な宮廷風の横長イラスト。

---
