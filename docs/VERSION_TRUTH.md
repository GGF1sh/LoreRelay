# バージョンの正本（AI・人間向け）

LoreRelay には **3 種類の「版」** があり、混同すると Web Grok / ChatGPT 等が「main は v1.6.1」と誤認します。

## 1. ソースの正本（いちばん信頼する）

| 確認先 | 意味 |
|--------|------|
| `package.json` の `version` | **ソースに宣言されたコード版**。作業中の変更を区別するには exact HEAD SHA も併記する |
| `CHANGELOG.md` の `[Unreleased]` と、その次の版番号付きセクション | **変更履歴**。未採番の変更は `[Unreleased]`、採番済みの範囲は版番号付きセクションで確認する。実装・統合の確認は current main と照合する |
| `git log origin/main -1` | **公開 main の先頭コミット** |

**リポジトリ:** https://github.com/GGF1sh/LoreRelay  
**ローカル正本パス:** `C:\AI\text-adventure-vsce`（`C:\AI\LoreRelay` は別クローンのことがある）

## 2. 配布の正本（VSIX・更新通知）

| 確認先 | 意味 |
|--------|------|
| [GitHub Releases](https://github.com/GGF1sh/LoreRelay/releases) | **ユーザーが `Check for Updates` で取る版**。Release と VSIX asset の存在を確認する |
| タグ `v*` push | `.github/workflows/release.yml` が VSIX を生成（`package.json` と一致必須） |

**注意:** main の `package.json` が進んでいても、GitHub Release が古いタグのままなら「インストール済み拡張は古い」状態。ソースの版上げ・main への統合・VSIX 作成・Release 公開・ユーザーPCへの導入は別の出来事です。

## 3. 説明ドキュメント（履歴・スナップショット）

履歴文書の「v1.3+)」や `WORLD_AND_VISUAL_MEMORY.md` の「v1.6.1 時点」などは **機能導入時のラベル** または **参考**。READMEの接続検証表も日付付きのスナップショットです。現行コード版は `package.json`、配布版はGitHub Releasesで確認します。

| ドキュメント | 役割 |
|--------------|------|
| [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) | stable / experimental の区分一覧 |
| [`AI_ROADMAP.md`](../AI_ROADMAP.md) | タスク粒度・Phase 完了・次候補トラック |
| [`AI_SHARED_LOG.md`](../AI_SHARED_LOG.md) 先頭 **Current Snapshot** | AI 向け動的サマリ |

## AI 作業前の確認

```powershell
cd C:\AI\text-adventure-vsce
git fetch origin
node -p "require('./package.json').version"
node scripts/check_version_consistency.js
git status --short
git log -1 --format="%H %s"
git log origin/main -1 --format="%H %s"
```

ローカル checkout と `origin/main` は別々に確認します。未コミット変更を勝手に破棄・退避せず、既存の候補版・関連PR・タグ・Releaseも確認して採番を重複させないでください。

## ズレを直すときの優先順位

1. **ソースと配布の状態を切り分ける** — current main、ローカル起動版、`package.json`、Release asset を確認する。配布の遅れをコードの未実装と扱わない。
2. **次の候補の採番と整合性** — 下記の基準で判断し、必要なファイルを同じ変更で揃える。
3. **Current Snapshot / README / Roadmap** — 現行を表す値だけ更新する。動的バッジは維持する。
4. **配布** — ユーザーが配布・Releaseを依頼した場合にだけ、対応タグとVSIXを発行・確認する。差があるだけでタグをpushしない。
5. **履歴ドキュメント** — 過去の版番号・スクリーンショット・検証SHAを「最新」に一括置換しない。必要なら履歴だと注記する。

<a id="versioning-policy"></a>

## バージョン更新基準（AI必読）

INSTALLER-RELEASE-001 の既存ルールを、2026-09-13 のユーザー依頼に基づき具体化します。**PR数ではなく、変更の意味と、人間が区別すべき候補ビルドの区切りで採番します。** `check_version_consistency.js` は値の一致を調べるだけで、版上げの要否・互換性・配布済みかどうかは判断しません。

### どの桁を上げるか

| 判定 | 基準 | 例（番号は説明用で、予約・発行ではない） |
|------|------|------|
| **据置 / none** | 文書・README・コメント・テストのみなど、実行時の機能やプレイ用データを変えない変更。まだ人間へ渡さない同一候補内の開発途中のコミットも、一つの候補へまとめてよい | READMEのゲーム紹介文、翻訳、レビュー記録だけなら番号を変えない |
| **patch** | 互換性を維持した不具合修正、既存UIの使い勝手・表示の修正、性能・安定性改善。修正版を新しい人間テスト候補または配布物として渡すとき | `1.86.0 → 1.86.1`。Esc後の表示固着、保存先案内、既存設定が消える問題の修正 |
| **minor** | 後方互換の新しい機能フェーズ、プレイヤーが新しくできる一連の操作、対応する接続先・生成経路などの追加を含む候補 | `1.85.3 → 1.86.0`。場面プロンプト作成と外部画像取込、世界作成の新しい選択肢、外部地図の取込・表示調整など |
| **major** | 既存セーブ・設定・シナリオ・公開された連携契約などを、そのまま又は互換性を保つ移行で利用できなくする破壊的変更 | `1.x.y → 2.0.0`。具体的な非互換点と移行・復元方針を示し、ユーザー判断を得る。機能が増えた、公開宣伝する、AIモデルが変わったという理由だけでは上げない |

修正と新機能が同じ候補に含まれる場合は minor、破壊的変更を含む場合は major の判断を優先します。小さなUI修正と新しい遊び方の追加を、単なる変更行数で区別しません。データ形式の版番号はパッケージ版とは別契約であり、機械的に同時更新しません。

現行の整合性チェックは数値3要素の `X.Y.Z` を前提にしています。`-rc` や `+SHA` を `package.json.version` へ勝手に追加せず、候補の区分・SHAは別欄に記録します。

### いつ採番するか

- 同じ機能フェーズの実装・レビュー修正をまとめている間は、各コミットや各PRで必ず上げる必要はありません。未採番の実装は `[Unreleased]` に記録し、関連PRに次の採番タイミングを残します。
- **変更された実行内容を「これを試して」と人間へ渡す候補、または配布用VSIXを確定する前には、直前に出荷・人間テストした候補より新しい `X.Y.Z` を割り当てます。** main未マージのPR版をF5で試す場合も候補です。複数PRをまとめる場合は、統合した実際の候補に一度採番します。
- 候補を渡した後の追加修正は、次の候補を渡す前に少なくともpatchを上げます。新機能フェーズならminorです。版上げを「公開Releaseするときまで」無期限に先送りしません。
- 同じ実行内容の再確認、文書だけの変更、同じ候補の再起動で版を増やしません。作業中の細かな差分はSHAで識別し、未コミット変更がある場合はその事実も記録します。
- 既に識別子が重複していた過去の候補はSHAで区別し、履歴を書き換えません。次に渡す候補から是正します。判定時点のmain・関連PR・候補・タグを再確認し、複数AIが別内容へ同じ番号を予約しないよう、採番は既存の実装／統合担当一人が行います。
- **一度配布した同じ版番号のVSIXを、別の中身で差し替えません。** READMEなど文書だけでも、変更した内容を新しい配布物として出し直す場合は新しいパッケージ版を使います。通常の文書コミットで配布物を作り直す必要はありません。

### 版上げで一緒に揃えるもの

1. `package.json` の `version`。
2. `package-lock.json` のルート `version` と `packages[""].version`。依存関係全体を無関係に更新しない。
3. `CHANGELOG.md` の `[Unreleased]` 直後に新しい版番号付きセクションを作り、その候補に実際に含まれる未採番の変更を移す。まだ含まれない変更は `[Unreleased]` に残す。コード候補の記録とRelease公開済みの主張を混同しない。
4. この文書の **コード版メタデータ**。README 4言語の静的バッジがある場合は同期し、現在の動的バッジは変更不要。過去の画像名・検証表・旧版の履歴はそのまま残す。
5. 現行版を明示するCurrent Snapshotなどが対象作業で更新される場合は、その記載も整合させる。全履歴を更新する作業には広げない。

`node scripts/check_version_consistency.js` で上記の機械的な一致を確認します。文書変更にはリンク・パス・UTF-8の確認を行い、実装に必要な検証は [Development Verification Policy](DEVELOPMENT_VERIFICATION_POLICY.md) に従います。採番だけを理由に、同じ実行内容の全体テストやHuman Playをやり直しません。

### AIのPR・完了報告に残すこと

PR本文と最終報告に、短く **Version decision: none / patch / minor / major、変更前→変更後、理由** を残します。据置なら「文書のみ」または「開発途中で候補未提供・採番はどの統合時点か」を明示します。理由のない据置を続けないでください。

人間テスト候補を渡すときは **版番号・exact HEAD SHA・起動元・プレイ用workspace・未コミット変更の有無** を確認します。ユーザーPCを確認できないAIは起動済みだと断言せず、準備を担当するローカルAIへこの確認を引き継ぎます。

テスト記録は **実行者・対象SHA・操作範囲・結果** を区別します。ユーザー報告のHuman Playを「未実施」に戻さず、過去の成功を別のSHAや未確認の機能全体の成功へ広げません。

**版上げはRelease公開の承認ではありません。** タグpushは現在のrelease workflowを起動するため、ユーザーの配布依頼がない限りタグ・Release・配布VSIXを発行しません。マージ・Ready化・レビュー解決についても、その作業に適用される承認範囲を広げません。

## コード版メタデータ

この表はソースの宣言値です。同じ番号の後に積まれた未採番の変更は `[Unreleased]` と exact HEAD を確認してください。検証日・配布済み版・Human Playの成否を意味しません。

| 項目 | 値 |
|------|-----|
| `package.json` | **1.89.8** |
| CHANGELOG 先頭の版番号付きセクション | **[1.89.8]** |

Version decision: patch; 1.89.7 → 1.89.8。main向け累積Draft PR #153の監査で、全履歴復元時に削除された要約・背景・立ち絵が画面に残り、旧要約を再送できるP2を確認。ユーザー承認によりこの1件だけを修正した新しいプレイ候補です。通常の部分更新と正本の復元契約は維持し、タグ・Release・VSIXは公開しません。

## 検証・配布スナップショット（2026-09-08, AI Connection V2）

以下は当日の記録です。以後のHuman Playや配布状態を上書きする「現在の全体判定」ではありません。最新のユーザー報告・該当PR・実行証拠を範囲別に確認します。

| 項目 | 値 |
|------|-----|
| 対象 | 共通GM接続・5社Adapter・モデル選択・Player/QA fixture実行 |
| 実サービス確認 | Codex / Grok / Antigravity：実Host・実WebviewでCampaign／会話専用各3ターンと停止。3社のPlayer fixture・別セッションQAも確認済み。Claude / DeepSeekは機能実装済み、ユーザー指定で実サービス確認を後日に分離。詳細は [AI Connections](AI_CONNECTIONS.md) |
| 配布 | 2026-09-08確認時の最新GitHub Releaseは [v1.71.0](https://github.com/GGF1sh/LoreRelay/releases/tag/v1.71.0)。1.85.3はコード版で、今回のGM接続修復はタグ・VSIXを発行しない |
| Human Play（当日時点） | 未実施・未代替 |

## 過去のスナップショット（手動更新: 2026-07-29, COMBAT-STORY-SESSION-BRIDGE-V1-A-001）

> タスクブランチ `task/COMBAT-STORY-SESSION-BRIDGE-V1-A-001`（PR #57）。

| 項目 | 値 |
|------|-----|
| COMBAT-STORY-SESSION-BRIDGE-V1-A | PENDING write retry + compiled BattleSpec/roster snapshot persist |
| `package.json` | **1.84.32** |
| CHANGELOG 先頭 | **[1.84.32]** |
| COMBAT-LAB-STACKED-SPAWN-CORRECTIONS | lineFormation x=±50; refresh built-ins on load |
| COMBAT-LAB-STACKED-SPAWN | multi-unit Lab fixtures use distinct spawn coords (`lineFormation`) |
| PLAYABLE-BUILD-ARTIFACT-SYNC | Webview `build-webview` 出力を LF 正規化; Windows compile 後の CRLF-only dirty を防止 |
| PLAYABLE-V0-UI-001 | P2/P3/P4 Player Action Hub integrated; human visual/gameplay smoke required next |
| NOAI-PLAY-P4 | Deterministic zero-turn market travel integrated with canonical destination authority, request-id replay safety, truthful persistence, correct `旅に出る` UI, seven executable fixtures, and `generic_shared_gate_exclusion` as the exact contention proof scope; combined human smoke waits for UI polish |
| HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001 | Candidate only, not integrated to main. Collapsed Relay banner now renders as an always-visible strip with an accessible expand/collapse control (click/Enter/Space/aria-expanded); invalid/legacy persisted heights normalize safely; labels refresh on locale arrival. Detail: `docs/ai-tasks/HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001.md` |
| Stabilization integration (1.82.4, main) | Current-main UI/i18n behavior preserved; debug fast path integrated; writer-lease and installer fixture repairs integrated as test infrastructure; collapsed Relay-banner recovery now has a candidate (this branch) — live installer refresh and real extension-host human smoke remain pending |
| Campaign Kit | Phase A–G · 7 genre presets · sell_discovery · services state machine (condition/estValue) · **campaign resources** (campaignResourceOps) · factionId on campaign quests · `scrapbound-settlement` sample |
| Living World (LW1) | Commerce: 評判連動 market demand (v1.51.0) · 季節/region イベント連動 · **プレイヤー関係連動** (faction-controlled markets) |
| World Observatory | 新規 (v1.53.0): 市場価格履歴スパークライン・年代記タイムライン・観測者ティック (watch=無コスト / advance=資源消費)。`enableWorldObservatory` 既定 OFF |
| Domain Mode | D1–D5 + **D3 UI 完了** (v1.40.0) · F7–F10 engine + World タブ UI · v1.40.1 hardening |
| Guild Master (F11) | **G1–G4 完了** (v1.41.0–v1.44.1) · v1.44.1 hardening · `enableGuildMode` 既定 OFF |
| Parlor Mode | v1.34.0 出荷済 |
| Living World (履歴) | v1.23–v1.34 (Commerce / Agency / LW3) · Domain v1.39.x–v1.40.x |
| Debug Trace | P1 contracts (v1.77.14) · retention/coalesce/live run (v1.77.15) · Inspector UI Phase B + UX polish |
| MEDIA-M1 | Compatibility Gate + Media Profile Spine（v1.78.0）· 独立敵対的検証 PASS（`docs/ai-tasks/MEDIA-M1-INDEPENDENT-VERIFY.md`）· post-merge installer smoke は INSTALLER-RELEASE-001 待ち |
| MEDIA-COMFY-001 | ComfyUI long-load job lifecycle repair（v1.78.2）· human-smoke 候補 |
| NOAI-PLAY-P3 | Deterministic end-day integrated with P2/P3 shared mutation serialization and hermetic installer tests; live installer and combined P2/P3/P4 human smoke are deferred |
| GitHub Release latest | **v1.59.0** (`lorerelay-1.59.0.vsix` · タグ push で自動更新) ※コード版より遅れることがある |
| テスト | `npm test` expects **251/251** on this branch (adds `test_relay_banner_recovery.js`); static harnesses are not real extension-host human smoke |
