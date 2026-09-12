<h1 align="center">LoreRelay</h1>
<p align="center"><strong>旅に出る。誰かと出会う。自分の言葉で、その先へ。</strong><br /><sub>Bring your AI. Keep your world.</sub></p>

<p align="center"><a href="README.md">日本語</a> · <a href="README_en.md">English</a> · <a href="README_zh-CN.md">简体中文</a> · <a href="README_zh-TW.md">繁體中文</a></p>

霧の港町で謎を追う。地図を頼りに地下迷宮を探る。荒廃した世界で資源を集め、拠点へ持ち帰る。冒険を休んで、気に入ったキャラクターとの会話を楽しむ夜があってもいい。

**LoreRelayは、あなたの言葉で行動を決め、AIのゲームマスターと物語を進めるロールプレイRPGです。** 一人の人物との会話から、仲間との旅、交易や拠点運営を含むキャンペーンまで。遊びたい世界と、関わりたい人物から始められます。

VS Codeで動く、開発中のオープンソース作品です。対応するAIをGMに選び、キャラクター・世界設定・冒険の記録を自分のPCに保存して遊びます。

[どんな遊びができる？](#onboarding) · [最初の冒険を始める](#how-to-play) · [もっと画面を見る](#screenshots) · [使えるAI・料金](#ai-connections) · [インストール](#setup)

<p align="center"><a href="docs/assets/public-launch-v1.85.3/management-map.png"><img src="docs/assets/public-launch-v1.85.3/management-map.png" width="840" alt="管理表示の実画面。AIとの会話、世界の地図、交易の状態を一緒に確認。" /></a></p>

<p align="center"><sub>言葉で進めた冒険を、会話・地図・交易の画面で確かめる。1.85.3の実画面。</sub></p>

**[▶ 75秒で、冒険のひとこまを見る](docs/PUBLIC_LAUNCH_MEDIA.md)** — GMと話す → 市場で買う → 画面を開き直して続きを確認。動作確認用のサンプル世界で収録し、待ち時間を短縮した映像です。

| 次は、どこへ行こう？ | 何を買い、何を持ち帰ろう？ |
| :---: | :---: |
| <a href="docs/assets/screenshot-world-map.png"><img src="docs/assets/screenshot-world-map.png" width="390" alt="World Map画面。生成地図に地域名、地点、勢力圏と未探索領域を表示。" /></a> | <a href="docs/assets/public-launch-v1.85.3/trade-committed.jpg"><img src="docs/assets/public-launch-v1.85.3/trade-committed.jpg" width="390" alt="購入確定後のAction Hub。小麦1、所持金11、市場在庫49。" /></a> |

<p align="center"><sub>地図は以前の機能紹介画面、取引は1.85.3の購入後です。画像はクリックで拡大できます。</sub></p>

<a id="onboarding"></a>

## 次の一手は、あなたの言葉で

「港で話を聞く」「遺跡を調べる」「今日は街に戻る」。用意された選択肢を選ぶだけでなく、自分がしたい行動を文章で伝えられます。

**場面を読む → 行動する → GMの描写と結果を確かめる → 次の一手を考える。**

会話を楽しみたいときは、人物とのやり取りに集中する。冒険を進めたいときは、地図やクエストを開く。交易を使う世界なら、所持金や積載量を見ながら買うものを決める。文章を読む時間と、ゲームの中で考える時間を、自分のペースで行き来できます。

### 謎を追う旅も、廃墟から持ち帰る旅も

最初から世界設定を全部書く必要はありません。同梱シナリオには、こんな入口があります。

| 今夜、遊びたいのは | シナリオ |
| --- | --- |
| **霧の港町のミステリー。** 人物との会話や調査から、謎を追う物語へ。 | `harbor-mist` |
| **地下迷宮の探索。** 地図を見ながら、まだ知らない場所へ踏み込む。 | `lost-catacombs` |
| **終末世界の回収屋暮らし。** 廃墟を探索し、見つけた資源を持ち帰って、拠点と交易のある生活へ。 | `scrapbound-settlement` |
| **サイバーパンクの物語。** ネオンの世界を舞台にロールプレイする。 | `neon-rain` |
| **商いを軸にした旅。** 市場を訪ね、価格・在庫・運べる量を見ながら取引する。 | `trade-routes` |

自分の舞台を作りたいなら、Start Hubの質問に答えて始めることも、既存のキャラクターや世界設定を持ち込むこともできます。SillyTavernのキャラカード・ロアブックにも対応しています。

### 一人とじっくり話す？　それとも、世界へ出る？

| 遊びたいこと | 選ぶモード |
| --- | --- |
| **気に入ったキャラクターと、じっくり話したい。** 一対一の会話やロールプレイから始める。 | **Parlor** |
| **その世界の住人として会話したい。** 世界設定を背景に、人物とのやり取りを楽しむ。 | **In-World** |
| **仲間と旅をし、探索や暮らしを進めたい。** クエスト、資源、交易など、有効にした仕組みを使う。 | **Campaign** |

最初から全部の仕組みを使う必要はありません。世界の進み方も、**安定した暮らし・変化のある世界・手強い経営**から選び、経済や食料需要、紛争、関係の進行を調整できます。交易・拠点・世界シミュレーションには試験的な機能が含まれ、使える範囲はシナリオと設定によって変わります。[機能ごとの対応状況](docs/FEATURE_MATRIX.md)

### 気に入った場面を、旅の一枚に

文章で読んだ風景や、心に残ったやり取りを絵にしたくなったら、**「この場面を絵にする」**へ。描きたい内容を編集し、ChatGPT・Gemini・Grokなどへプロンプトをコピーして、作った画像をLoreRelayへ戻せます。気に入った一枚は、その場面の挿絵や背景に。

プロンプト作成と画像取込には、追加のAI接続やAPIキーは不要です。外部サービスでの生成条件・利用枠はサービス側に従います。ComfyUIによる自動生成は別の任意機能です。[場面の画像化ガイド](docs/VISUAL_COMPOSER_V1.md)

冒険の続きは、保存した世界から。会話履歴やロアブック、年代記を振り返り、Markdown／HTMLでリプレイとして残すこともできます。

<a id="how-to-play"></a>

## 最初の冒険を始める

1. **遊ぶ準備をする。** [インストール](#setup)を済ませ、専用のプレイ用フォルダを開きます。新しい機能を試す場合は現行ソースから起動します。
2. **GMを選ぶ。** コマンドパレットから `LoreRelay: AI接続`（英語UIでは `LoreRelay: AI Connections`）を開き、使いたい接続のログインと設定を済ませます。[接続先と料金の違い](#ai-connections)
3. **舞台とキャラクターを選ぶ。** `LoreRelay: Open Game UI` → Start Hubで「質問に答えて始める」か「既存キャラ・世界を使う」。デモ群や `LoreRelay: Load Scenario Pack` から同梱シナリオも選べます。保存済みの世界は「続ける」へ。
4. **最初の一言を送る。** 選択肢か自由入力で行動し、GMの描写と結果を確かめます。交易を有効にした世界では、共通の「行動」から取引・市場移動・日送りへ進めます。

シナリオの初期画面は、AIを接続する前にも表示できます。そこからGMと物語を進めるには接続準備が必要です。接続で迷ったら [AI Connections](docs/AI_CONNECTIONS.md) を参照してください。

<a id="screenshots"></a>

## 冒険の先には、こんな場面も

ここからは、遊び方を広げる機能のギャラリーです。地図UI・物流・場面画像・仲間・ロアブック・戦闘には以前の紹介画像を使っており、現在の画面と配置が異なる場合があります。画像はクリックで拡大できます。

### 物語に浸る日も、世界を見渡す日も

物語を読みたいときは**物語表示**、資源や地図を見たいときは**管理表示**、背景や立ち絵を楽しみたいときは**演出表示**。遊び方や世界のルールはそのままに、見せ方を変えられます。画像なしでも遊べます。

| 明るい画面で、会話を追う | 落ち着いた画面で、物語を読む |
| :---: | :---: |
| <a href="docs/assets/readme-light-v1.85.2.png"><img src="docs/assets/readme-light-v1.85.2.png" width="390" alt="ライトテーマの実Webview。市場での会話、行動候補、自由入力を表示。" /></a> | <a href="docs/assets/readme-story-v1.85.2.png"><img src="docs/assets/readme-story-v1.85.2.png" width="390" alt="ダークテーマの物語表示。市場の会話と次の行動を同じ画面で確認。" /></a> |

<p align="center"><sub>1.85.2で、同じ保存済みサンプル会話を表示。テーマを変えても会話の内容は変わりません。</sub></p>

### 地図を開けば、行ってみたい場所がある

平野の先の街、森を抜ける街道、まだ調べていない遺跡。生成した地図背景に地点や未探索領域を重ね、行き先の情報を開きながら旅を進めます。

<p align="center"><a href="docs/assets/worldmap-showcase-fixture/world_map.png"><img src="docs/assets/worldmap-showcase-fixture/world_map.png" width="760" alt="World Forgeの地域レイアウトから生成した地図背景。緑の平野、森林、街道と中央の街。" /></a></p>

<p align="center"><sub>ComfyUIで作った同梱の地図背景例。地点・霧・交易路は、ゲーム画面で別に重ねて表示します。</sub></p>

| 地図上で、次の行き先を探す | 遺跡を開き、旅の準備を考える |
| :---: | :---: |
| <a href="docs/assets/screenshot-world-map.png"><img src="docs/assets/screenshot-world-map.png" width="390" alt="World Map画面。生成地図に地域名、地点、勢力圏と未探索領域を表示。" /></a> | <a href="docs/assets/screenshot-world-map-detail.png"><img src="docs/assets/screenshot-world-map-detail.png" width="390" alt="地図上の遺跡を選択し、危険度や地域、移動と調査の操作を確認する画面。" /></a> |

### 拾ったものを売る。次の旅に備える。

資源を手に入れたら、何を売り、何を残すか。市場では価格・在庫・所持金・積載量を見ながら取引できます。探索だけで終わらず、持ち帰ったものを次の暮らしや旅につなげる遊び方です。

<p align="center"><a href="docs/assets/public-launch-v1.85.3/trade-committed.jpg"><img src="docs/assets/public-launch-v1.85.3/trade-committed.jpg" width="480" alt="購入確定後のAction Hub。小麦1、所持金11、市場在庫49。" /></a></p>

<p align="center"><sub>1.85.3の購入結果。所持金20→11、小麦0→1。買ったものと支払った金額を確認できます。</sub></p>

さらに経営寄りに遊ぶなら、市場や集落、施設を結ぶ物流網へ。領地・ギルド・車両拠点など、設定で選べる実験的なシステムもあります。会話だけで遊ぶ場合は、これらを使う必要はありません。

<p align="center"><a href="docs/assets/screenshot-logistics.png"><img src="docs/assets/screenshot-logistics.png" width="900" alt="物流網の画面。港、市場、集落、施設を結ぶ交易ルートと流量、状態フィルターを表示。" /></a></p>

<p align="center"><sub>拠点同士のつながりを見渡す物流画面。以前の機能紹介画像で、現在状態のプレビューです。</sub></p>

### 景色を残し、仲間との会話を楽しむ

地下回廊の灯り、旅先で見た景色。場面画像を添えると、会話ログを読み返す楽しみも増えます。下は既存のComfyUI連携で作ったシーン画像の例です。

<p align="center"><a href="docs/assets/screenshot-comfyui.png"><img src="docs/assets/screenshot-comfyui.png" width="620" alt="冒険ログに表示されたComfyUI生成画像。ランタンが照らす石造りの地下回廊。" /></a></p>

仲間との会話では、発言量や人物間の関係を調整できます。キャラクターや世界の設定はロアブックへ。場面画像、立ち絵、BGM／SE、読み上げも、楽しみたいものだけ追加できます。画像生成・音声などの外部ツールやモデルは別途準備します。

| 誰の話を、もっと聞きたい？ | 人物や世界の設定を手元に |
| :---: | :---: |
| <a href="docs/assets/screenshot-party-director.png"><img src="docs/assets/screenshot-party-director.png" width="390" alt="Party Directorの仲間カード。発言量、ミュート、強制発言と人物間の関係を調整。" /></a> | <a href="docs/assets/screenshot-lorebook.png"><img src="docs/assets/screenshot-lorebook.png" width="390" alt="Lorebookの設定一覧。人物と勢力、領地の項目に有効化とピン留めを設定。" /></a> |

<p align="center"><a href="docs/assets/hero-ui.jpg"><img src="docs/assets/hero-ui.jpg" width="840" alt="灯りのともる酒場で、AIのGMと冒険を始めるイメージイラスト。" /></a></p>

<p align="center"><sub>冒険の雰囲気を表したイメージイラストです。実際の操作画面ではありません。 <a href="docs/assets/README.md">画像の出典</a></sub></p>

<a id="combat"></a>

### 部隊の動きを組み立てる（実験中）

戦闘シミュレーターとBattle Viewでは、味方・敵のHP、ガンビット、移動命令、戦闘ログを確認できます。会話や経営とは別に、戦闘を試すための実験的な機能です。

<p align="center"><a href="docs/assets/screenshot-battle-view.png"><img src="docs/assets/screenshot-battle-view.png" width="900" alt="Battle View。味方と敵のHP、ガンビットと移動命令、戦闘ログを表示。" /></a></p>

**現状はコマンドから開始します。** GMが物語から自動的に戦闘を開始する導線と、単体アバターの直接操作UIは未提供です。[機能の対応状況](docs/FEATURE_MATRIX.md) · [戦闘の設計と制約](docs/COMBAT_SYSTEM_DESIGN.md)

LANの**Remote Play**で、参加・観戦する遊び方もあります。インターネット公開を前提とした機能ではありません。

<a id="ai-connections"></a>

## 冒険を任せるGMも、自分で選ぶ

LoreRelayのGMには、対応する月額サービスの公式クライアント、従量課金API、ローカルLLMを選べます。すでに使っているAIが対応していれば、その利用枠を使う道もあります。

**サブスク利用枠は、無料・無制限を意味しません。** 利用できるモデルや枠、課金方式は接続先とアカウントに依存します。

| サービス | LoreRelayのGM接続経路 | 利用枠・課金 | 実サービス確認 |
| --- | --- | --- | --- |
| **ChatGPT / Codex** | 公式Codex App Server | ChatGPTアカウントのCodex利用枠 | 確認済み |
| **Grok** | Grok Build / ACP | 公式クライアントのアカウント利用枠 | 確認済み |
| **Gemini / Antigravity** | Antigravity CLI | 公式クライアントのアカウント利用枠 | 確認済み |
| **Claude** | Claude Code | 対応するClaudeサブスク認証 | 機能実装済み・未確認 |
| **DeepSeek** | OpenAI互換API | APIキー・従量課金 | 機能実装済み・未確認 |

確認範囲は**2026-09-08時点の1.85.2**。上の3社は、隔離した実Host／WebviewでCampaign・会話専用それぞれ3ターンと停止を確認しています。すべてのモデル・環境を保証するものではありません。[モデル・クライアント版と接続手順](docs/AI_CONNECTIONS.md)

接続メニューでは、Codex／Claude Codeは「GMとして使う」、Google／Grokは「Antigravity CLI — GM」／「Grok Build — GM」を選びます。公式ログインと送信同意を済ませ、モデルを設定してください。候補一覧が取得できる接続では選択式、必要なら手入力も使えます。

既存の**VS Code LM、Ollama、KoboldCPP、OpenRouter、clipboard／手動連携**も利用できます。VS Code LMはVS Codeが公開するモデルだけを使います。通常のWebチャット契約をAPIキーへ転用する機能ではありません。[従来のBridge設定](GM_BRIDGE_PRESETS.md)

<details>
<summary>AIに送る情報と、ゲームの結果を保存する仕組み</summary>

AI Connection V2では、AIにゲームの正本ファイルを直接編集させません。Hostが既存のAccepted Turn経路で候補を検証し、確定した内容を保存します。応答途中の文章は未確定です。

```mermaid
flowchart LR
    Human["あなたの行動"] --> Host["LoreRelay"]
    Host --> AI["選んだAI GM"]
    AI --> Candidate["描写・状態更新の候補"]
    Candidate --> Accept["Hostが検証して確定"]
    Accept --> Local["ローカル保存・ゲーム画面"]
    Local --> Human
```

初回接続時に送信対象を確認します。GMには入力・会話履歴に加え、必要な非公開世界設定が送られる場合があります。**API課金への自動切替、モデルの自動変更、自動再送は行いません。** 接続準備完了と実際の応答成功も区別します。

NOAIでは、対応する世界処理や取引・市場移動・日送りをAI呼出しなしで進められます。自由な物語を生成するGMの代替ではありません。

人間向けGM接続とは別に、AI Playerへの操作委譲、隔離したQA、明示的な操作録画もあります。Playerの対象は**取引・市場移動・日送り**の3操作。QAの内部情報とPlayerの公開情報を別セッションに分けます。AIによる検査を人間のプレイ確認とは扱いません。[Player Lab／QAと記録](docs/AI_CONNECTION_V2_PLAYER_LAB.md)

</details>

<a id="setup"></a>

## インストール

**このREADMEはmainの機能を説明しています。配布VSIXに同じ機能が含まれるとは限りません。** 新しい接続や場面画像機能を試す場合は、現行ソースから起動してください。[配布ファイル](https://github.com/GGF1sh/LoreRelay/releases) · [バージョンの正本](docs/VERSION_TRUTH.md)

### 現行ソースから起動

VS Code **1.93以上**、Node.js／npm、Gitを用意します。

```sh
git clone https://github.com/GGF1sh/LoreRelay.git
cd LoreRelay
npm ci
npm run compile
```

VS Codeでこのフォルダを開いて **F5**。起動したExtension Development Hostでプレイ用フォルダを開きます。VSIXにする場合は `npx @vscode/vsce package` を実行し、VS Codeの「VSIXからのインストール」を使います。

AI Connection V2には選んだ公式クライアントの導入と専用ログイン、またはDeepSeek APIキーが必要です。Python／`TextAdventureGMSkill`は従来のスクリプト連携、ダイス・地図など利用する機能に応じて準備します。`textAdventure.skillPath`はスキル側の `scripts/comfyui_generate.py` の絶対パスです。

従来のスキル連携をまとめて設定する場合は、隣に `TextAdventureGMSkill` を置き、Windowsでは `.\scripts\setup.ps1`、macOS／Linuxでは `bash scripts/setup.sh`。依存導入・コンパイル・テストを行うセットアップです。ComfyUIやVLMは任意です。

## 対応状況・詳しいガイド

LoreRelayは開発中のOSSです。会話から世界運営までの入口がありますが、機能ごとに完成度は異なります。まずは気になった遊び方を一つ選んで試してください。

| もっと知りたいこと | ガイド |
| --- | --- |
| キャラクターや世界設定を持ち込みたい | [SillyTavern互換](SILLYTAVERN_COMPAT.md) |
| 探索・回収のキャンペーンを遊びたい | [Campaign Kit](docs/CAMPAIGN_KIT_QUICKSTART.md) |
| 場面を絵にして、挿絵や背景にしたい | [場面プロンプト・画像取込](docs/VISUAL_COMPOSER_V1.md) |
| 画像・地図・音声を追加したい | [ComfyUI](COMFYUI_WORKFLOWS.md) · [Cartography](docs/CARTOGRAPHY_COMFYUI.md) · [TTS](docs/TTS_QUICKSTART.md) |
| GM接続・ログイン・利用枠を確認したい | [AI Connections](docs/AI_CONNECTIONS.md) |
| ローカル／API／手動GMを設定したい | [Bridge設定](GM_BRIDGE_PRESETS.md) · [従来のAntigravity連携](ANTIGRAVITY_GUIDE.md) |
| 使える機能と変更履歴を確認したい | [機能一覧](docs/FEATURE_MATRIX.md) · [CHANGELOG](CHANGELOG.md) · [Roadmap](AI_ROADMAP.md) |
| 開発やテストに参加したい | [開発手順](docs/AI_WORKFLOW.md) · [Test Console](docs/TEST_CONSOLE.md) |

<details>
<summary>動作確認の範囲・掲載画像について</summary>

AI接続の確認は、有限のテスト用シナリオでの実サービス動作を示すものです。任意の世界での長期プレイ品質やバランスを保証するものではありません。

場面プロンプト作成 → 外部AIで画像生成 → LoreRelayへ取込 → 採用 → 閉じて再表示、の一往復については、ユーザーから実機での実施報告があります。これは場面画像V1の確認であり、キャンペーン全体の長期Human Play完了を意味しません。

冒頭の実演と1.85.2の会話画面には、動作確認用の合成fixtureを使っています。実演の待ち時間は短縮しており、再表示はパネルを開き直した確認です。OS再起動の実演ではありません。地図・物流・仲間・ロアブック・戦闘などの以前の紹介画像と、操作画面ではないイメージイラストも区別しています。[実演・画像の記録](docs/PUBLIC_LAUNCH_MEDIA.md) · [画像の出典](docs/assets/README.md)

開発・検証用の同梱シナリオには `debug-sandbox` もあります。`npm run test:console` または `LoreRelay_Test_Console.bat` で、変更ファイルから関連テストを選ぶダッシュボードを開けます。すべての修正に全体テストを繰り返す運用ではありません。

</details>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT license" /></a>
  <a href="https://github.com/GGF1sh/LoreRelay/actions/workflows/ci.yml"><img src="https://github.com/GGF1sh/LoreRelay/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="docs/VERSION_TRUTH.md"><img src="https://img.shields.io/github/package-json/v/GGF1sh/LoreRelay?label=version&amp;color=blue" alt="Source version" /></a>
</p>

[不具合報告・提案](https://github.com/GGF1sh/LoreRelay/issues) · [MIT License](LICENSE) · [開発を応援する ☕](https://ko-fi.com/promptpalette)
