# LoreRelay Webview UI/UX ビジュアルレビュー（2026-07-18, Fable 5）

**目的**: グラフィカル面（見た目・レイアウト・情報設計）のレビュー。実装は他AIが担当する前提の指摘リスト。
**方法**: 現ワーキングツリーのビルド成果物（`webview/index.html` + `script.js` + `style.css`、branch `task/NOAI-ECON-FLOWS-ARCHITECTURE` @ 2c0b5bc, v1.83.0）を静的ハーネスで起動し、fixture注入で Start Hub / チャット / Adventure Status / World / Genesis Guide / Game Rules / テーマ4種 / GM待ち / 狭幅(640px) を実写確認。
**スクリーンショット**: `C:\Users\Keisuke\Pictures\lorerelay-visual-review\2026-07-18-uiux-review\`（15枚。`*-narrow`=640px幅、`*-full`=縦長全景）
**注意**: 一部絵文字が「⊠」に見えるのはヘッドレスChromeのフォント代替による撮影アーティファクトの可能性が高い（VS Code内では通常表示される想定）。指摘対象にはしていない。

## 総評

1画面ごとの「質感」は既に高い。チャットバブル・HP/MPバー・タグ表示・Genesis Guideモーダル・mermaidワールドマップ・クエスト/派閥カードは、このまま見せられる水準にある。世界観テーマ(eastern/horror/cyberpunk等)のアクセント切替も上品。

問題は個々の見た目ではなく構造側に集中している：

1. **狭幅でレイアウトが崩壊する**（最重要・新規実装が必要なのはこれ）
2. **過去のUXブランチ3本が未マージで、直したはずの問題が現行画面に全部残っている**（実装済み資産の死蔵）
3. **操作要素の過積載**（下部4段スタック、サイドバー全展開）
4. **World タブの言語混在・ラベル欠落**（細かいが目につく）

## High

### H1. 狭幅（~700px以下）でチャット列が壊滅する
`starthub-narrow.png` / `chat-narrow.png` / `world-narrow.png` 参照。

- `#status-area` が固定幅 `width: var(--status-width, 320px)` + `flex-shrink: 0`（`webview/styles/30-status-gallery.css:2`）で、狭幅時もサイドバーが320px（ユーザーがリサイズ保存していれば最大800px）を占有し続ける。640px幅ではチャット本文が実質250px・1行8文字程度になる。
- レイアウト全体を積み替える `@media` / container query が存在しない（既存の max-width クエリは Genesis モーダルと vehicle-garage のみ）。
- ヘッダーのボタン群が4段に折り返し、入力行は送信ボタン以外が見切れる。
- VS Code のエディタ分割では普通に発生する幅。初回起動が狭幅ペインだった場合、Start Hub がこの状態で第一印象になる。

**提案**: ~700px以下で (a) サイドバーをタブ/ドロワー化してチャットを全幅にする、または (b) `--status-width` に `min(320px, 45vw)` 系の上限を入れる。`#status-area` は既に `container-type: inline-size` なので container query 資産も使える。ヘッダーは狭幅時にオーバーフローメニューへ畳む。

### H2. UX改善ブランチ3本が未マージのまま死蔵されている
今回確認した現行画面には、過去に実装完了済みの以下がどれも効いていない：

| ブランチ | 入っている改善 | 今日の画面で残っている症状 |
|---|---|---|
| `ux/playable-milestone-pass` (3c940c3) | Status のツール群(ダイス/電卓/BGM/ギャラリー/テーマ)を details 折りたたみ、Summary を上部へ | サイドバーが全展開の長大1カラム、あらすじが最下部（`status-full.png`） |
| `ux/start-hub-genesis-visual-polish` (0787703) | Start Hub 3層化（主要4択+残りを折りたたみ） | 「はじめての方:」の下に地図デモ(上級)・デバッグサンドボックスまでフラット陳列（`starthub-wide.png`） |
| `ux/PLAY-UX-001-cinematic-play-mode` (644c1ae) | 読書カラム・管理UI退避のシネマティックモード | 広幅で1行60字超の長い行長、常時管理UI（H4/M1に波及） |

**提案**: 新規のUX実装より先に、この3本のマージ判断（rebase・競合解消含む）をやるのが費用対効果最大。今回の指摘のうちサイドバー全展開・Start Hub陳列・行長は実装済みコードのマージだけで解決する。

### H3. 下部操作スタックの過積載と重複
`chat-wide.png` 参照。選択肢ボタン行 + 作者メモ入力 + クイックリプライ11個 + 入力行(送信/1ターン戻る/再生成/🎨/🎤) の4段が常時表示。

- 「戻る」「再生成」がQRバーと入力行の両方にある（完全重複）。
- 1400px幅でもQRバーは右端が見切れる（HTMLエクスポート/なりすまし発言/Quest Flow/Relations が切れている）。横スクロールできることは視覚的に分からない。
- プレイ中の主役は「選択肢+自由入力」だけで足りる。アーカイブ/エクスポート/パック読込は毎ターン使わない。

**提案**: QRバーを「頻用3-4個 + ⋯メニュー」に再編し、入力行との重複を排除。ロードマップ既載の「ヘッダーボタンのオーバーフローメニュー化」と同時にやると良い。

## Medium

### M1. チャット本文の行長が広幅で長すぎる
`.msg { max-width: 88% }`（`webview/styles/10-layout-chat.css:442`）のため、1400px幅ではGMバブル本文が900px超・全角60字/行になる。物語テキストの快適な行長は35-45字。cinematicブランチの読書カラムが本命だが、通常モードでも `.msg-body` に `max-width: 42em` 程度を入れるだけで大きく改善する。

### M2. World タブ市場表に列ヘッダーがない
`world-full.png` の市場カード：「塩 14 22 x1.40」— 単価/在庫/価格指数の3数値が無札で並ぶ。初見では読めない。カード先頭に1行ヘッダー（品名/単価/在庫/指数）を足すだけでよい（`85-world.js` renderLivingWorldMarkets）。

### M3. World タブの生ID・ハードコード英語
- 商隊パネルの積荷が `salt × 3`、輸送が `wagon` と生ID表示（quotes側には commodityName があるのに cargo 側で未使用。renderPlayerCommerce）。
- `Set Portrait` / `Change`（`85-world.js:1854`）、`N regions · N locations · Turn N`（`85-world.js:220`）、グローバルイベントの `[major]` 等がハードコード英語。日本語UIの中で浮く。
- Game Rules パネルも「Enable Commerce」「Enable Faction Reputation」等の英語ラベルが日本語ラベルと混在（`rules-wide.png`）。

**提案**: i18nキー化の一括パス。`check_i18n_keys.js` 資産があるので回収は容易なはず。

### M4. 「暮らす」ボタン（NOAIメインループ入口）が埋没
`world-full.png`：取引・旅・一日終了をまとめる Player Action Hub の入口が、商隊パネル内の小さな標準ボタン1個。NOAIモードでは事実上のメイン動線なので、プライマリボタン（送信ボタンと同格の視覚重量）に格上げする価値がある。

### M5. World タブが単一長大カラム
マップ→NPC→商隊→市場→絆→派閥→クエストの縦積みで、fixture程度のデータ量でも2800px。実プレイ（市場12件・絆8件）ではさらに伸びる。羊皮紙/タイル等のマップモードバーの並びに「セクションへのジャンプ」または既定で市場・派閥以外を畳む等、縦方向のナビゲーションが欲しい。

### M6. ゲーム未開始時の右ペインが空虚
`starthub-wide.png`：Start Hub 表示中もサイドバーは「--- / 状態 - / 所持品 -」の空欄群+ダイスローラー。初回体験の半分が空白。未開始時はサイドバーを「遊び方3行+Genesis誘導」等のオンボーディング表示に差し替えると初見の印象が大きく変わる。

## Low

- **L1**: GM待ちインジケータ（`gmwait-wide.png`）がかなり暗く、狭幅だと見落とす。もう1段明るく+選択肢バー付近にも状態表示があると安心感が出る。
- **L2**: テーマ切替UI（世界観テーマ）がサイドバー最下部で発見性が低い。Genesis適用で自動設定されるので実害は小さいが、手動切替の導線としては深すぎる。
- **L3**: `renderRecentChanges` の `T${ev.worldTurn}`（`85-world.js:2008`）は worldTurn 未定義時に「Tundefined」と表示される（本番ペイロードでは常に入る想定なので実害小。ガード1行）。
- **L4**: Genesis Guide のジャンル7枚が3+3+1で最終行が孤立。8枚目（ランダム/おまかせ）を足すか2列にすると座りが良い。完成度は既に高いので優先度低。

## 良かった点（維持すべきもの）

- チャットバブルの質感・GM/Player の視覚区別・msg-actions の思想（97-visual-refresh 系）
- Adventure Status の情報設計（現在地/日時/資金→バー→タグ）はゲーム画面として読みやすい
- Genesis Guide：進行ドット・案内人・ジャンルカード・「急ぐならざっと作る」の逃げ道、いずれも丁寧
- mermaid ワールドマップ+マップモードバー、クエスト/派閥カードの色分け
- テーマ別アクセント（eastern の琥珀、horror の暗赤、cyberpunk のマゼンタ）は上品で世界観を壊さない

## 推奨着手順

1. **H2: 未マージ3ブランチの統合判断**（実装ゼロで指摘の1/3が消える）
2. **H1: 狭幅レイアウト**（新規実装の最優先。CSS中心で src/** 不要）
3. **H3+ヘッダー整理**（オーバーフローメニュー化、ロードマップ既載）
4. M2/M3（World タブのラベル・i18n一括パス、小粒で独立）
5. M4/M5/M6（NOAI動線と初回体験、デザイン判断が要るので要相談）

---
検証ハーネス: `C:\AI\.claude\launch.json` の `uiux-review-harness`（port 8952、`?scenario=starthub|chat|world|genesis|rules|gmwait`、`&theme=<id>` 付加可）。fixture・変換スクリプトは本セッションのスクラッチパッド `build-harness.js` / `uiux-harness/scenario.js` 方式（`docs/ai-tasks/` 直下ではなく使い捨て）。
