# 灰燼のエンバーフォール — 画像プロンプト

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

## ① ブリギッド 立ち絵

**ComfyUI positive:**
```
1woman, 40s, weathered blacksmith turned guild receptionist, short cropped auburn hair, sharp tired eyes, leather apron over linen shirt, ornate brass mechanical prosthetic right forearm, standing behind a wooden guild counter, quill in left hand, warm tavern firelight, dark fantasy tavern interior, upper body portrait, detailed face, painterly illustration, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

薄暗い冒険者ギルドの受付カウンター越しに立つ40代の女性を描いてください。元鍛冶師で、革のエプロンに麻のシャツ。右前腕は真鍮製の精巧な義手。短く刈った赤褐色の髪、鋭く疲れた目。左手に羽根ペン。暖炉の光が横から当たる、絵画的なダークファンタジー風の胸像イラスト。

---

## ② ノエル 立ち絵

**ComfyUI positive:**
```
1man, late 20s, government auditor from the capital, neat dark hair, pale complexion, immaculate high-collared navy coat with silver clasps, holding a thick leather ledger, standing stiffly in a rough frontier tavern, out of place, cold daylight from a window, upper body portrait, detailed face, painterly illustration, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

辺境の粗末な酒場に、明らかに場違いな清潔さで立つ20代後半の若い男性文官を描いてください。銀の留め具のついた紺の立襟コート、整えた黒髪、青白い肌。分厚い革表紙の帳簿を抱えている。窓からの冷たい光。緊張した姿勢。絵画的なファンタジー風の胸像イラスト。

---

## ③ 背景：炉端亭 一階酒場

**ComfyUI positive:**
```
interior of a frontier adventurers guild tavern, morning light through grimy windows, large stone hearth with low fire, wooden quest board with half-empty parchment notices, long scarred tables, hanging iron lanterns, dust motes in the air, no people, dark fantasy, painterly, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

辺境の冒険者ギルド酒場の一階内部を、人物なしで描いてください。朝の光が汚れた窓から差し込み、大きな石造りの暖炉には弱い火。依頼票が半分しか貼られていない木の掲示板、傷だらけの長机、鉄のランタン。埃が舞う。ダークファンタジーの絵画的な横長イラスト。

---

## ④ 背景：灰の壁

**ComfyUI positive:**
```
a colossal wall of grey ash and petrified debris towering over a frozen northern frontier, faint embers drifting in the air, ruined watchtowers along its base, overcast sky bleeding grey, desolate, no people, dark fantasy landscape, painterly, wide shot, high detail
```

**チャットAI用（ChatGPT / Grok / Gemini にそのまま貼り付け可）:**

北の凍てついた辺境にそびえる、灰と石化した瓦礫でできた巨大な壁を描いてください。空気には微かな残り火が舞い、壁の根元には崩れた見張り塔が並ぶ。曇天が灰色に濁っている。人物なし、荒涼としたダークファンタジーの横長風景画。

---
