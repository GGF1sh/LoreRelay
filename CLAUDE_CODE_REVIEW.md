# LoreRelay コードレビュー & 設計提案 (Claude版 - v1.1.2)

> レビュー日: 2026-06-27  
> 対象コミット: HEAD (v1.1.2 直後スナップショット)  
> レビュー担当: Claude Sonnet 4.6

## 対応状況（v1.1.3 追記）

| 指摘 | 状態 |
|------|------|
| コマンド二重登録 (`checkForUpdates`) | ✅ v1.1.2 |
| `maxClients` 未実装 | ✅ v1.1.2 |
| 未認証クライアントへのメッセージ破棄 | ✅ v1.1.2 (`sendToClient` force) |
| `remoteInputLocked` finally 解除 | ✅ v1.1.2 |
| `gameRules` 同期 I/O キャッシュ | ✅ v1.1.2 |
| `isGameOverActive()` 毎回 readFileSync | ✅ v1.1.3 (`isGameOverActiveCached`) |
| `timingSafeEqual` トークン比較 | ✅ v1.1.3 |
| `remoteInputLocked` 60s ウォッチドッグ | ✅ v1.1.3 |
| `gmPromptBuilder` 同期 I/O 連鎖 | ✅ v1.1.3（キャッシュ + lorebook mtime） |
| VLM `buildVisionContext` スタブ | ⏸ 意図的保留（Phase 4A） |
| `panelManager` 分割 / `createWebviewHandlerDeps` 肥大化 | 📋 低優先・未着手 |

---

## 1. 総合評価

**総合グレード: B+（良好、ただし本番前に修正すべきバグが複数あり）**

v1.1.0 以降の連続したリファクタリング（コマンド分割、`ws` パッケージ移行、アトミック書き込み導入）は全体的に正しい方向であり、かつてのGod Fileだった `extension.ts` が ~835 行まで縮小されたことは高く評価できる。`remotePlayServer.ts` の `ws` 移行も自作フレーム解析の廃止により大幅に安全性が上がっている。

一方で、後述するように **接続制限が設定されているのに実際には機能していないバグ** や、**未認証クライアントへのメッセージが無音で破棄されるバグ**、**コマンドの二重登録**など、本番環境に直接影響する問題が残存している。これらは優先度高で修正を推奨する。

---

## 2. 詳細レビューと指摘事項

### 2-1. `src/extension.ts` / `src/extension/commands.ts`

#### 🔴 [High] コマンド二重登録バグ

`textadventure.checkForUpdates` コマンドが **2 か所** で登録されている。

- `src/extension.ts:276` — `vscode.commands.registerCommand('textadventure.checkForUpdates', ...)`
- `src/extension/commands.ts:33` — 同一コマンドを再度登録

VSCode はコマンド ID が重複した場合、実行時エラー（`Command already registered`）をスローするか、後勝ちで上書きされるか挙動が不定。いずれにせよ意図しない動作になる。`extension.ts` 側の登録（line 276-278 と line 292-299 への追加）を削除し、`commands.ts` 側に一本化すること。

#### 🟡 [Medium] `commands.ts` の未完了 TODO

```typescript
// importStLorebook will be moved or imported  ← line 4
```

この TODO コメントは放置されており、現在 `importStLorebook` は `extension.ts` のローカル関数として定義されたまま `registerCoreCommands()` へのコールバックとして渡されている。設計上は `lorebookLoader.ts` か専用モジュールに移し、`commands.ts` が直接 import すべき。

#### 🟡 [Medium] `isGameOverActive()` の同期ファイル読み込み

`extension.ts:481-490` の `isGameOverActive()` は毎ターン `fs.readFileSync()` で `game_state.json` を読む。ゲームが長期化して `game_state.json` が数百 KB になった場合、拡張ホストプロセスのメインスレッドをブロックする。`gameStateSync.ts` が既にゲーム状態をメモリキャッシュしているはずなので、ディスク読み込みではなくキャッシュから `gameOver.active` を参照するよう改善を推奨。

#### 🟡 [Medium] `createWebviewHandlerDeps()` の肥大化

`extension.ts:767-818` の `createWebviewHandlerDeps()` は 50 以上のハンドラ関数を一つのオブジェクトにまとめている。これ自体は依存注入パターンとして理解できるが、追加のたびにここへの変更が必要になるため、今後の拡張で再び肥大化するリスクがある。詳細は §3 で提案。

---

### 2-2. `src/remotePlayServer.ts` — WebSocket セキュリティ

#### 🔴 [High] `maxClients` が設定されているのに機能していない

`getConfig()` の `maxClients: Math.max(1, Math.min(32, ...))` (line 114) は正しく上限付きで読み込まれているが、`wss.on('connection', ...)` ハンドラ（line 469）に **クライアント数チェックが存在しない**。したがって現状は無制限に接続を受け入れてしまい、悪意ある接続（または誤動作したクライアント）によるメモリ枯渇の原因になる。

```typescript
// ← この直後に追加すべき
wss.on('connection', (socket, req) => {
    if (wsClients.size >= getConfig().maxClients) {
        socket.close(1013, 'Max clients reached');
        return;
    }
    // ...
```

#### 🔴 [High] 未認証クライアントへのメッセージが無音で破棄される

`sendToClient()` (line 229-234) は先頭で `!client.authenticated` をチェックして早期リターンする。しかしこの関数は以下の 2 箇所で未認証クライアントに対して呼び出されており、メッセージは**一切届かない**：

1. **line 490**: `sendToClient(client, { type: 'authRequired' })` — 新規接続時にクライアントへ認証を促すはずのメッセージが届かない
2. **line 297**: `sendToClient(client, { type: 'error', message: 'Unauthorized' })` — 不正トークン送信時のエラーが届かない

現状、クライアントは接続後に何も返答がないまま 5 秒後に `authTimer` で切断されるだけで、UX も診断も難しい。未認証クライアント向けに `sendRaw()` のような別関数を用意するか、`sendToClient` の認証チェックを認証済み専用メッセージにのみ適用するよう設計を見直す必要がある。

#### 🟡 [Medium] `remoteInputLocked` の永続ロックリスク

`handleWsMessage` (line 336) で `remoteInputLocked = true` に設定した後、正常系（`onPlayerInput` 成功）では明示的に `false` へ戻さず、`notifyRemoteGmBusy(false)` 経由でリセットされる（line 581）。もし GM ブリッジがクラッシュして `notifyRemoteGmBusy(false)` が呼ばれなかった場合、リモートプレイが永続的にロックされ、サーバー再起動まで操作不能になる。タイムアウトウォッチドッグを設けることを推奨（例：60 秒後に自動解除）。

```typescript
// 修正例: 成功ケースでも明示的にリセット
try {
    await d.onPlayerInput(text, authorsNote);
} catch (e) {
    log(`Remote input failed: ...`);
} finally {
    remoteInputLocked = false;  // GM busy 通知に依存せず確実に解除
}
```

#### 🟡 [Medium] トークン比較がタイミング攻撃に対して脆弱

`msg.token === sessionToken` (line 276) は JavaScript の `===` による文字列比較で、文字ごとに早期終了するため理論上のタイミングサイドチャネルがある。LAN 内専用であれば実用上のリスクは低いが、`crypto.timingSafeEqual()` への変更を推奨する（line 372 の SECURITY LIMITATION コメントとも整合する改善）。

#### 🟢 [Low] `void code;` は dead code

`closeClient()` line 250 の `void code;` は TypeScript の「未使用変数」警告を消すための回避策だが、可読性を下げる。引数名を `_code` に変更するほうが慣用的。

---

### 2-3. `src/gameRules.ts` — 同期 I/O

`loadGameRules()` (line 37) は `fs.readFileSync()` を使用している。`saveGameRules()` は `writeJsonAtomic()` でアトミック書き込みを行っており一貫性はあるが、読み込みが同期のままであることは `buildGmPromptContext()` → `buildGameRulesPromptContext()` → `loadGameRules()` のコールチェーン全体をブロッキングにしている。GM プロンプト生成タイミングは毎ターン呼ばれる頻度なので `fs.promises.readFile` への移行が望ましい。

---

### 2-4. `src/gmPromptBuilder.ts` — I/O とVLM統合

#### 同期 I/O が連鎖している

以下の関数がすべて `fs.readFileSync()` を使用しており、`buildGmPromptContext()` 内でチェーン呼び出しされる：

- `loadStorySummary()` (line 91) — game_state.json を同期読み込み
- `buildVisionContext()` (line 492) — 同上
- `loadAllLorebookEntriesRaw()` (line 110) — lorebook.json を同期読み込み

プロンプト生成はプレイヤー入力のたびに実行されるクリティカルパスであり、大きなファイルに対してブロッキング I/O が重なると応答レイテンシに影響する。

#### Phase 4A VLM 統合はスタブ状態

`buildVisionContext()` (line 485-498) は `latestImage` のファイルパスをテキストとして GM に伝えるだけで、実際に画像バイナリを API に送っていない。以下のケースにしか機能しない：
- Grok などファイルシステムにアクセスできるエージェント
- Grok が独自にパスから画像を読めるプロバイダ

OpenRouter/Ollama の VLM モデル（例：`llava`、`gemma3`）で真の視覚統合を行うには、画像を base64 エンコードして multimodal API リクエストとして送る層が必要。現在の実装は「VLM 統合の骨格」であってエンドユーザーには機能しない可能性がある点を明記しておく必要がある。

---

## 3. 具体的な改善コード提案 (Refactoring Proposals)

### 提案 A: `maxClients` を実際に機能させる

**Before (src/remotePlayServer.ts:469付近)**
```typescript
wss.on('connection', (socket, req) => {
    const client: WsConnection = {
```

**After**
```typescript
wss.on('connection', (socket, _req) => {
    const cfg = getConfig();
    if (wsClients.size >= cfg.maxClients) {
        socket.close(1013, 'Server full');
        log(`Connection rejected: maxClients (${cfg.maxClients}) reached.`);
        return;
    }
    const client: WsConnection = {
```

---

### 提案 B: 未認証クライアントへの送信を `sendRaw()` で分離

**Before (src/remotePlayServer.ts)**
```typescript
function sendToClient(client: WsConnection, message: Record<string, unknown>): void {
    if (!client.authenticated || client.socket.readyState !== WebSocket.OPEN) {
        return;
    }
    client.socket.send(JSON.stringify(message));
}
```

**After**
```typescript
// 認証前後を問わず送信（handshakeメッセージ用）
function sendRaw(client: WsConnection, message: Record<string, unknown>): void {
    if (client.socket.readyState !== WebSocket.OPEN) { return; }
    client.socket.send(JSON.stringify(message));
}

// 認証済みクライアントへの送信（通常メッセージ用）
function sendToClient(client: WsConnection, message: Record<string, unknown>): void {
    if (!client.authenticated) { return; }
    sendRaw(client, message);
}
```

そして以下を変更:
```typescript
// line 490
sendRaw(client, { type: 'authRequired' });   // ← sendToClient → sendRaw

// line 297
sendRaw(client, { type: 'error', message: 'Unauthorized' });  // ← sendToClient → sendRaw
```

---

### 提案 C: コマンド二重登録の修正

**`src/extension.ts` の 276-278 行と 292-299 の `checkForUpdatesCmd` をすべて削除し、`commands.ts` 側の登録のみ残す。**

**Before (src/extension.ts)**
```typescript
const checkForUpdatesCmd = vscode.commands.registerCommand('textadventure.checkForUpdates', () => {
    void checkForUpdates(false, context);
});

context.subscriptions.push(
    openGameCmd,
    setOpenRouterKeyCmd,
    clearOpenRouterKeyCmd,
    startRemotePlayCmd,
    stopRemotePlayCmd,
    rotateRemotePlayTokenCmd,
    checkForUpdatesCmd  // ← 削除
);
```

**After (src/extension/commands.ts:33付近 — 現状のまま維持)**
```typescript
const checkForUpdatesCmd = vscode.commands.registerCommand('textadventure.checkForUpdates', () => {
    void checkForUpdates(false, context);  // ここだけ残す
});
```

---

### 提案 D: `extension.ts` のさらなる分割（`panelManager.ts` の導入）

現在 `activate()` 内の `openGameCmd` 登録コールバック（line 185-264）は約80行のパネル生成ロジックを含んでいる。これを `src/panelManager.ts` に抽出することで `extension.ts` を純粋な「初期化と登録のオーケストレーター」に保てる。

```typescript
// src/panelManager.ts (新規)
export interface PanelManagerDeps {
    context: vscode.ExtensionContext;
    onMessage: (msg: WebviewMessage) => void;
    onDispose: () => void;
}

export function createPanel(deps: PanelManagerDeps): vscode.WebviewPanel {
    // パネル生成、HTML インジェクション、リソースルート設定を担当
}
```

これにより `extension.ts` の `openGameCmd` ハンドラが 5 行程度まで縮小できる。

---

### 提案 E: `gameRules.ts` の非同期化スケッチ

```typescript
// Before
export function loadGameRules(): GameRules {
    const data = fs.readFileSync(rulesPath, 'utf-8');
    // ...
}

// After
export async function loadGameRulesAsync(): Promise<GameRules> {
    try {
        const data = await fs.promises.readFile(rulesPath, 'utf-8');
        const parsed = JSON.parse(data);
        return { ...DEFAULT_GAME_RULES, ...parsed };
    } catch {
        return { ...DEFAULT_GAME_RULES };
    }
}
```

ただし、`buildGmPromptContext()` が同期関数として設計されているため、呼び出しチェーン全体を async に変更するリファクタリングコストが発生する。段階的に行うなら、まず `gameRules.json` をキャッシュする仕組み（FileSystemWatcher でキャッシュ更新）を導入する方が現実的。

---

## 4. 今後の拡張（VLM / シミュレーション強化）へのロードマップ提言

### Phase 4A VLM 真の統合に向けて

現状の `buildVisionContext()` はファイルパスを文字列として渡すだけ。真の VLM 統合には以下の設計変更が必要：

1. **`llmClient.ts` に multimodal サポートを追加**  
   OpenRouter の `/api/v1/chat/completions` は `content: [{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }]` 形式をサポートしている。`buildGmPromptContext()` ではなく、各 GM ブリッジ（`openrouter_gm.py` / Ollama）の API 呼び出し層で画像を添付する設計が自然。

2. **VLM 対応プロバイダの判定フラグを追加**  
   `getConfig()` に `gmBridge.openRouter.visionEnabled: boolean` を追加し、VLM 未対応モデルへ誤って画像を送らないようにガードする。

3. **`latestImage` の base64 変換を `gmPromptBuilder.ts` で行う**  
   `buildVisionContext()` 内で `isAllowedImagePath()` 検証後に `fs.promises.readFile(path)` → `toBase64()` してブリッジへ渡す。

### バックグラウンドシミュレーション強化について

`BACKGROUND SIMULATION ENABLED` プロンプト（`gameRules.ts`）は現在、GM への「指示テキスト」を追加するだけであり、実際にバックグラウンドで LLM を動かしているわけではない。真の実装には：
- タイマーベースのバックグラウンドターン（`setInterval` + `invokeGmBridge()` のサイレント呼び出し）
- バックグラウンドターンのメイン UI への非同期通知（既存の `gmBusy` フラグを使用可能）

ただし、ローカル LLM では処理時間が長いためユーザー体験設計が難しい。`mediaAgent.ts` のキュー設計を参考に、バックグラウンドターンキューを `mediaAgent` に組み込む方法が最も自然に見える。

---

## 5. 推奨する次の 1〜3 セッションのタスク

### 【最優先】次セッション（バグ修正）

1. **`maxClients` を実際に機能させる** — `wss.on('connection')` の先頭に接続数チェックを追加（提案 A）。DoS 対策として最重要。
2. **`sendToClient` / `sendRaw` 分離** — 未認証クライアントへの `authRequired` と `Unauthorized` エラーを正しく届ける（提案 B）。
3. **コマンド二重登録を修正** — `extension.ts` から `checkForUpdates` コマンド登録を削除（提案 C）。

### 【高優先】次々セッション（安定性強化）

4. **`remoteInputLocked` の自動解除タイムアウト** — GM ブリッジクラッシュ時の永続ロック対策。`finally` ブロックでの確実なリセットを実装。
5. **`isGameOverActive()` のキャッシュ化** — `gameStateSync.ts` のインメモリキャッシュから参照するよう変更。
6. **`commands.ts` の TODO 解消** — `importStLorebook` をコールバック受け渡しではなく `lorebookLoader.ts` から直接 import する形に整理。

### 【中優先】その後（アーキテクチャ改善）

7. **`panelManager.ts` の抽出** — `extension.ts` の `openGameCmd` コールバックを独立モジュールへ（提案 D）。
8. **`gameRules.json` キャッシュ層の導入** — FileSystemWatcher でキャッシュ更新し、`loadGameRules()` の同期ディスクアクセスを撤廃。
9. **VLM 統合の設計固め** — `llmClient.ts` への base64 画像添付設計を仕様化し、`openrouter_gm.py` 側と合わせてプロトタイプ実装。

---

*このレビューは Claude Sonnet 4.6 によるソースコード静的解析に基づいています。実機動作確認（特に remoteInputLocked のロック挙動、maxClients の動作確認）を推奨します。*
