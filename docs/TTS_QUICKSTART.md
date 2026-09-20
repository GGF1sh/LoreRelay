# LoreRelay TTS — Quick Start

NPC 音声は **3段階** で足していけます。最初は Step 1 だけで十分です。

## Step 1: System TTS（デフォルト・追加設定なし）

1. Game UI 右上 **🔊** をクリック
2. **有効化** にチェック
3. GM メッセージの **📢** で読み上げ

これはブラウザの Web Speech API です。API キー不要・オフライン寄り。

### NPC ごとの声（Phase 11A）

- `npc_registry.json` の NPC に `voice` ブロック（`rate` / `pitch` / `label` 等）
- World タブで **🔊 Preview**
- チャット 📢 は `sender` 名＋現在地で NPC 声を適用（同名曖昧時はグローバル TTS）

## Step 2: Local TTS（edge-tts・任意）

より自然な MP3 音声。ワークスペース trusted 必須。

```bash
pip install edge-tts
```

1. NPC の `voice.provider` を `local` に設定（または World Preview で確認）
2. コマンド **LoreRelay: Test Local TTS** で動作確認
3. 失敗時は **自動で Step 1 にフォールバック**

設定（任意）:

| 設定 | 説明 |
|------|------|
| `textAdventure.tts.local.command` | カスタム CLI（空なら `tts_local.py`） |
| `textAdventure.tts.local.defaultVoice` | edge-tts ボイス名 |
| `textAdventure.tts.local.timeoutMs` | タイムアウト（default 30s） |

## Step 3: OpenAI External（任意・opt-in）

**デフォルト OFF**（プライバシー）。台詞テキストのみ送信。

1. `textAdventure.tts.external.enabled` = `true`
2. `textAdventure.tts.external.provider` = `openai`
3. コマンド **LoreRelay: Set TTS API Key**（SecretStorage）
4. NPC `voice.provider` = `external`

## トラブルシュート

| 問題 | 確認 |
|------|------|
| 音が出ない | 🔊 有効化、📢 クリック、OS の音量 |
| local が鳴らない | `pip install edge-tts`、Output Channel `LoreRelay: TTS` |
| 外部 TTS が鳴らない | `external.enabled`、API キー、provider=openai |
| 同じ NPC 名で声が違う | 同名 NPC は現在地で解決。曖昧ならグローバル TTS |

詳細設計: [PHASE11_ADAPTIVE_TTS_DESIGN.md](../PHASE11_ADAPTIVE_TTS_DESIGN.md)