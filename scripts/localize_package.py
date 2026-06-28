import json

def main():
    package_path = 'package.json'
    with open(package_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    nls_en = {}
    nls_ja = {}
    nls_zh_cn = {}
    nls_zh_tw = {}

    cmd_ja = {
        "textadventure.openGame": "LoreRelay: ゲームUIを開く",
        "textadventure.listImageModels": "LoreRelay: 画像生成モデル一覧を取得",
        "textadventure.loadScenario": "LoreRelay: シナリオパックをロード",
        "textadventure.importStCharacter": "LoreRelay: SillyTavern キャラクターカードをインポート",
        "textadventure.importStLorebook": "LoreRelay: SillyTavern 補足設定(Lorebook)をインポート",
        "textadventure.exportScenario": "LoreRelay: シナリオパックをエクスポート (ZIP)",
        "textadventure.validateScenario": "LoreRelay: シナリオパックの整合性チェック",
        "textadventure.setOpenRouterApiKey": "LoreRelay: OpenRouter APIキーを設定",
        "textadventure.clearOpenRouterApiKey": "LoreRelay: OpenRouter APIキーを消去",
        "textadventure.checkForUpdates": "LoreRelay: アップデートを確認",
        "textadventure.startRemotePlay": "LoreRelay: リモートプレイを開始 (LAN)",
        "textadventure.stopRemotePlay": "LoreRelay: リモートプレイを停止",
        "textadventure.rotateRemotePlayToken": "LoreRelay: リモートプレイの接続トークンを再生成",
        "textadventure.generateWorldForge": "LoreRelay: ワールド設定(World Forge)を生成"
    }

    cmd_zh_cn = {
        "textadventure.openGame": "LoreRelay: 打开游戏 UI",
        "textadventure.listImageModels": "LoreRelay: 列出图像模型",
        "textadventure.loadScenario": "LoreRelay: 加载场景包",
        "textadventure.importStCharacter": "LoreRelay: 导入 SillyTavern 角色卡",
        "textadventure.importStLorebook": "LoreRelay: 导入 SillyTavern 设定集 (Lorebook)",
        "textadventure.exportScenario": "LoreRelay: 导出场景包 (ZIP)",
        "textadventure.validateScenario": "LoreRelay: 验证场景包",
        "textadventure.setOpenRouterApiKey": "LoreRelay: 设置 OpenRouter API 密钥",
        "textadventure.clearOpenRouterApiKey": "LoreRelay: 清除 OpenRouter API 密钥",
        "textadventure.checkForUpdates": "LoreRelay: 检查更新",
        "textadventure.startRemotePlay": "LoreRelay: 启动远程联机 (LAN)",
        "textadventure.stopRemotePlay": "LoreRelay: 停止远程联机",
        "textadventure.rotateRemotePlayToken": "LoreRelay: 轮换远程联机令牌",
        "textadventure.generateWorldForge": "LoreRelay: 生成世界设定 (World Forge)"
    }

    cmd_zh_tw = {
        "textadventure.openGame": "LoreRelay: 開啟遊戲 UI",
        "textadventure.listImageModels": "LoreRelay: 列出圖像模型",
        "textadventure.loadScenario": "LoreRelay: 載入場景包",
        "textadventure.importStCharacter": "LoreRelay: 匯入 SillyTavern 角色卡",
        "textadventure.importStLorebook": "LoreRelay: 匯入 SillyTavern 世界設定集 (Lorebook)",
        "textadventure.exportScenario": "LoreRelay: 匯出場景包 (ZIP)",
        "textadventure.validateScenario": "LoreRelay: 驗證場景包",
        "textadventure.setOpenRouterApiKey": "LoreRelay: 設定 OpenRouter API 金鑰",
        "textadventure.clearOpenRouterApiKey": "LoreRelay: 清除 OpenRouter API 金鑰",
        "textadventure.checkForUpdates": "LoreRelay: 檢查更新",
        "textadventure.startRemotePlay": "LoreRelay: 啟動遠端聯機 (LAN)",
        "textadventure.stopRemotePlay": "LoreRelay: 停止遠端聯機",
        "textadventure.rotateRemotePlayToken": "LoreRelay: 輪換遠端聯機權標",
        "textadventure.generateWorldForge": "LoreRelay: 生成世界設定 (World Forge)"
    }

    config_ja = {
        "textAdventure.locale": "Webview、拡張機能のメッセージ、GMストーリーテリング用プロンプトのUI言語。Webviewヘッダーのドロップダウンからも変更可能です。",
        "textAdventure.skillPath": "comfyui_generate.py スクリプトへの絶対パス。",
        "textAdventure.imageGen.backend": "画像生成のバックエンド。すべてのオプションは ComfyUI API を使用します（接続先は imageGen.comfyuiUrl で設定します）。",
        "textAdventure.imageGen.comfyuiUrl": "ComfyUI または Stability Matrix サーバーのURL。ポートが8188以外の場合はここで変更してください。",
        "textAdventure.imageGen.checkpoint": "使用するモデル名（.safetensors）。'LoreRelay: List Image Models' コマンドで表示される名前を正確に指定してください。空にするとワークフローのデフォルトが使用されます。",
        "textAdventure.imageGen.workflowPath": "カスタムの ComfyUI API 形式ワークフロー JSON のパス。空にすると同梱の workflow_api.json が使用されます。",
        "textAdventure.imageGen.steps": "サンプリングステップ数の上書き設定（0 = ワークフローのデフォルトを使用）。",
        "textAdventure.imageGen.cfg": "CFGスケールの上書き設定（0 = ワークフローのデフォルトを使用）。",
        "textAdventure.imageGen.width": "生成画像の幅（ピクセル）（0 = ワークフローのデフォルトを使用）。",
        "textAdventure.imageGen.height": "生成画像の高さ（ピクセル）（0 = ワークフローのデフォルトを使用）。",
        "textAdventure.imageGen.autoOnLocationChange": "World Forgeでプレイヤーの現在地（ロケーション）が変わったときに、自動的に風景画像を生​​成します。",
        "textAdventure.imageGen.includeFactionInPrompt": "生成する場所の画像プロンプトに、その場所を支配する「勢力（Faction）」の雰囲気を自動的に含めます。",
        "textAdventure.imageGen.includeDangerInPrompt": "生成する場所の画像プロンプトに、その地域の「危険度（Danger Level）」の雰囲気を自動的に含めます。",
        "textAdventure.vlm.provider": "生成された画像を分析するためのVLM（マルチモーダルモデル）プロバイダーを選択します（Soulgaze機能）。",
        "textAdventure.vlm.model": "VLMのモデル名（例: Ollamaなら 'llava'、OpenAIなら 'gpt-4o-mini'、Geminiなら 'gemini-1.5-flash'）。",
        "textAdventure.vlm.endpoint": "VLMプロバイダーのエンドポイントURL。",
        "textAdventure.bgm.enabled": "自動BGM再生を有効にします。GMは game_state.json 内の 'bgm' または 'mood' フィールドに基づいて曲を選択します。",
        "textAdventure.bgm.manifestPath": "BGMマニフェストJSONへのパス。空にするとワークスペースのルートにある 'bgm.json' を使用します。",
        "textAdventure.bgm.volume": "デフォルトのBGM音量 (0-100)。",
        "textAdventure.sfx.enabled": "ワンショット効果音を有効にします。GMは game_state.json 内の 'sfx' フィールドから効果音をトリガーします。",
        "textAdventure.sfx.manifestPath": "SFXマニフェストJSONへのパス。",
        "textAdventure.sfx.volume": "デフォルトの効果音音量 (0-100)。",
        "textAdventure.mediaAgent.enabled": "バックグラウンドの MediaAgent パイプラインを有効にします。",
        "textAdventure.mediaAgent.autoImage": "GMの応答に imagePrompt が含まれ画像が未生成の場合、バックグラウンドで非同期に画像を生成します。",
        "textAdventure.mediaAgent.maxImageQueue": "画像生成ジョブの最大キュー数。",
        "textAdventure.remotePlay.port": "リモートプレイ用の HTTP/WebSocket サーバーのポート番号。",
        "textAdventure.remotePlay.bindAddress": "リモートプレイサーバーのバインドIPアドレス。LAN接続を許可するには 0.0.0.0 を指定します（警告: ネットワーク全体に公開されます）。",
        "textAdventure.remotePlay.maxClients": "同時に接続できるクライアントの最大数。",
        "textAdventure.remotePlay.inputCooldownMs": "リモートプレイヤーのコマンド入力クールダウン時間（ミリ秒）。",
        "textAdventure.remotePlay.defaultRole": "デフォルトロール（player または spectator）。",
        "textAdventure.workspaceFolder": "game_state.json を置くワークスペース内のフォルダ名。空の場合は最初のフォルダが使用されます。",
        "textAdventure.gitAutoCommitInterval": "ゲーム履歴を自動的にGitにコミットするターンの間隔。0で無効化。",
        "textAdventure.gmBridge.provider": "プレイヤー入力をどのようにGM（AI）に送信して応答を処理するかを設定します。",
        "textAdventure.gmBridge.python": "GMブリッジスクリプトを実行するための Python 実行可能ファイルのパス。",
        "textAdventure.gmBridge.scriptPath": "GMブリッジスクリプトへのカスタムパス。",
        "textAdventure.gmBridge.ollama.url": "Ollama APIのベースURL。",
        "textAdventure.gmBridge.ollama.model": "Ollamaのモデル名。",
        "textAdventure.gmBridge.koboldcpp.url": "KoboldCPP APIのベースURL。",
        "textAdventure.gmBridge.openRouter.apiKey": "（非推奨のフォールバック用）OpenRouterのAPIキー。コマンドから設定することをお勧めします。",
        "textAdventure.gmBridge.openRouter.model": "使用する OpenRouter のモデル名。",
        "textAdventure.gmBridge.command": "gmBridge.provider=command の場合に実行するコマンドのパス。",
        "textAdventure.gmBridge.commandArgs": "カスタムGMコマンドに渡す引数のリスト。",
        "textAdventure.grokBridge.enabled": "プレイヤー入力を自動的に Grok Build (headless) に送信します。",
        "textAdventure.grokBridge.command": "grok CLIへのパス。",
        "textAdventure.grokBridge.autoApprove": "Grok Build実行時にツールの自動実行を承認する `--always-approve` フラグを渡します。",
        "textAdventure.grokBridge.fallbackToClipboard": "Grok Buildの呼び出しに失敗した場合、プレイヤーの入力をクリップボードにコピーします。",
        "textAdventure.archive.autoPrompt": "ログが長くなったときに、古い履歴ターンをサガ（章）のチャプターにアーカイブすることを提案します。",
        "textAdventure.archive.thresholdSmallContext": "Ollama / KoboldCPP などのコンテキストが小さいモデル用の、アーカイブ提案しきい値ターン数。",
        "textAdventure.archive.thresholdLargeContext": "Grok / Gemini などのコンテキストが大きいモデル用の、アーカイブ提案しきい値ターン数。",
        "textAdventure.archive.remindEvery": "しきい値を超えた後、何ターンごとに再提案するか。",
        "textAdventure.worldForge.defaultRegionCount": "新しい World Forge を生成する際のデフォルトの地域（Region）数。",
        "textAdventure.worldForge.defaultFactionCount": "新しい World Forge を生成する際のデフォルトの勢力（Faction）数。",
        "textAdventure.worldForge.defaultNpcCount": "新しい World Forge を生成する際のデフォルトのNPC数。",
        "textAdventure.worldForge.llmEnrich": "World Forgeの生成時、LLMを使用して各地域や勢力、NPCに詳細な設定やフレーバーテキストを自動付与して拡張します。",
        "textAdventure.memory.backend": "NPC RegistryやWorld State用のセマンティックメモリのインデックス作成バックエンド。"
    }

    config_zh_cn = {
        "textAdventure.locale": "Webview、扩展消息和 GM 叙事提示词的 UI 语言。也可在 Webview 头部下拉菜单中修改。",
        "textAdventure.skillPath": "comfyui_generate.py 脚本的绝对路径。",
        "textAdventure.imageGen.backend": "图像生成后端。所有选项均使用 ComfyUI API（终点通过 imageGen.comfyuiUrl 设置）。",
        "textAdventure.imageGen.comfyuiUrl": "ComfyUI 或 Stability Matrix 服务器的 URL。如果你的服务器不在 8188 端口，请在此更改。",
        "textAdventure.imageGen.checkpoint": "要使用的 checkpoint (.safetensors) 名称。请准确填写 'LoreRelay: List Image Models' 提示的名称。留空使用工作流默认值。",
        "textAdventure.imageGen.workflowPath": "自定义 ComfyUI API 格式工作流 JSON 的路径。留空使用内置的 workflow_api.json。",
        "textAdventure.imageGen.steps": "采样步数覆盖（0 = 使用工作流默认值）。",
        "textAdventure.imageGen.cfg": "CFG 比例覆盖（0 = 使用工作流默认值）。",
        "textAdventure.imageGen.width": "生成图像宽度（像素）（0 = 使用工作流默认值）。",
        "textAdventure.imageGen.height": "生成图像高度（像素）（0 = 使用工作流默认值）。",
        "textAdventure.imageGen.autoOnLocationChange": "在 World Forge 中更改玩家位置时自动生成场景图像。",
        "textAdventure.imageGen.includeFactionInPrompt": "在生成的地点图像提示词中包含控制该地点的“势力（Faction）”氛围。",
        "textAdventure.imageGen.includeDangerInPrompt": "在生成的地点图像提示词中包含该区域的“危险度（Danger Level）”氛围。",
        "textAdventure.vlm.provider": "选择 VLM（多模态模型）提供商以分析生成的图像（Soulgaze功能）。",
        "textAdventure.vlm.model": "VLM 模型名称（例如 Ollama 的 'llava'，OpenAI 的 'gpt-4o-mini'，Gemini 的 'gemini-1.5-flash'）。",
        "textAdventure.vlm.endpoint": "VLM 提供商的端点 URL。",
        "textAdventure.bgm.enabled": "启用自动背景音乐。GM 将根据 game_state.json 中的 'bgm' 或 'mood' 字段选择曲目。",
        "textAdventure.bgm.manifestPath": "BGM 清单 JSON 的路径。留空使用工作区根目录下的 'bgm.json'。",
        "textAdventure.bgm.volume": "默认 BGM 音量 (0-100)。",
        "textAdventure.sfx.enabled": "启用单次音效。GM 通过 game_state.json 中的 'sfx' 字段触发音效。",
        "textAdventure.sfx.manifestPath": "SFX 清单 JSON 的路径。",
        "textAdventure.sfx.volume": "默认音效音量 (0-100)。",
        "textAdventure.mediaAgent.enabled": "启用后台 MediaAgent 管道（包含异步 ComfyUI 生成）。",
        "textAdventure.mediaAgent.autoImage": "当 GM 条目包含 imagePrompt 且无图像时，在后台异步队列中生成 ComfyUI 图像。",
        "textAdventure.mediaAgent.maxImageQueue": "图像生成作业的最大队列数。",
        "textAdventure.remotePlay.port": "本地远程联机联机 HTTP/WebSocket 服务器端口。",
        "textAdventure.remotePlay.bindAddress": "远程联机绑定的 IP 地址。允许 LAN 访问请设为 0.0.0.0（警告：将暴露给网络），本地限制设为 127.0.0.1。",
        "textAdventure.remotePlay.maxClients": "最大 WebSocket 联机客户端数量。",
        "textAdventure.remotePlay.inputCooldownMs": "每个远程客户端的最小输入冷却时间（毫秒）。",
        "textAdventure.remotePlay.defaultRole": "默认客户端角色（player 或 spectator）。",
        "textAdventure.workspaceFolder": "多文件夹工作区中，game_state.json 所在文件夹名。留空为第一个文件夹。",
        "textAdventure.gitAutoCommitInterval": "自动将游戏历史提交到 Git 的转折间隔。设为 0 速度慢时建议禁用。",
        "textAdventure.gmBridge.provider": "Webview 的玩家输入如何发送给 GM (AI) 进行响应。",
        "textAdventure.gmBridge.python": "用于运行 Ollama/KoboldCPP 等 GM 桥接脚本的 Python 可执行文件路径。",
        "textAdventure.gmBridge.scriptPath": "GM 桥接脚本的自定义路径。",
        "textAdventure.gmBridge.ollama.url": "Ollama API 基址 URL。",
        "textAdventure.gmBridge.ollama.model": "Ollama 模型名称。",
        "textAdventure.gmBridge.koboldcpp.url": "KoboldCPP API 基址 URL。",
        "textAdventure.gmBridge.openRouter.apiKey": "（不推荐）OpenRouter API 密钥。推荐使用命令存储至 VS Code 安全存储中。",
        "textAdventure.gmBridge.openRouter.model": "要使用的 OpenRouter 模型名称。",
        "textAdventure.gmBridge.command": "gmBridge.provider=command 时的可执行文件路径。",
        "textAdventure.gmBridge.commandArgs": "自定义 GM 命令参数列表。",
        "textAdventure.grokBridge.enabled": "自动将 Webview 玩家输入发送给 Grok Build (headless 模式)。",
        "textAdventure.grokBridge.command": "Grok CLI 路径。",
        "textAdventure.grokBridge.autoApprove": "向 Grok Build 传递 `--always-approve` 以免除工具确认提示（警告：启用此项有安全隐患）。",
        "textAdventure.grokBridge.fallbackToClipboard": "当 Grok 调用失败时，将输入复制到剪贴板作为备用。",
        "textAdventure.archive.autoPrompt": "当日志变长时，建议将旧的历史回合归档为传奇（Saga）章节。",
        "textAdventure.archive.thresholdSmallContext": "适用于 Ollama / KoboldCPP 等小上下文模型的归档建议阈值回合数。",
        "textAdventure.archive.thresholdLargeContext": "适用于 Grok / Gemini 等大上下文模型的归档建议阈值回合数。",
        "textAdventure.archive.remindEvery": "达到阈值后，每隔多少回合再次提醒归档。",
        "textAdventure.worldForge.defaultRegionCount": "生成新 World Forge 时的默认区域（Region）数量。",
        "textAdventure.worldForge.defaultFactionCount": "生成新 World Forge 时的默认势力（Faction）数量。",
        "textAdventure.worldForge.defaultNpcCount": "生成新 World Forge 时的默认 NPC 数量。",
        "textAdventure.worldForge.llmEnrich": "在生成 World Forge 时，使用 LLM 自动为各个区域、势力和 NPC 添加详细设定与背景故事进行扩展。",
        "textAdventure.memory.backend": "NPC 注册表及世界状态的语义内存索引后端。"
    }

    config_zh_tw = {
        "textAdventure.locale": "Webview、擴充功能訊息和 GM 敘事提示詞的 UI 語言。也可在 Webview 頭部下拉選單中修改。",
        "textAdventure.skillPath": "comfyui_generate.py 腳本的絕對路徑。",
        "textAdventure.imageGen.backend": "圖像生成後端。所有選項均使用 ComfyUI API（端點透過 imageGen.comfyuiUrl 設定）。",
        "textAdventure.imageGen.comfyuiUrl": "ComfyUI 或 Stability Matrix 伺服器的 URL。若您的伺服器不在 8188 埠，請在此變更。",
        "textAdventure.imageGen.checkpoint": "要使用的 checkpoint (.safetensors) 名稱。請準確填寫 'LoreRelay: List Image Models' 提示的名稱。留空使用工作流預設值。",
        "textAdventure.imageGen.workflowPath": "自訂 ComfyUI API 格式工作流 JSON 的路徑。留空使用內置的 workflow_api.json。",
        "textAdventure.imageGen.steps": "採樣步數覆蓋（0 = 使用工作流預設值）。",
        "textAdventure.imageGen.cfg": "CFG 比例覆蓋（0 = 使用工作流預設值）。",
        "textAdventure.imageGen.width": "生成圖像寬度（像素）（0 = 使用工作流預設值）。",
        "textAdventure.imageGen.height": "生成圖像高度（像素）（0 = 使用工作流預設值）。",
        "textAdventure.imageGen.autoOnLocationChange": "在 World Forge 中變更玩家位置時自動生成場景圖像。",
        "textAdventure.imageGen.includeFactionInPrompt": "在生成的地點圖像提示詞中包含控制該地點的「勢力（Faction）」氛圍。",
        "textAdventure.imageGen.includeDangerInPrompt": "在生成的地點圖像提示詞中包含該區域的「危險度（Danger Level）」氛圍。",
        "textAdventure.vlm.provider": "選擇 VLM（多模態模型）提供商以分析生成的圖像（Soulgaze功能）。",
        "textAdventure.vlm.model": "VLM 模型名稱（例如 Ollama 的 'llava'，OpenAI 的 'gpt-4o-mini'，Gemini 的 'gemini-1.5-flash'）。",
        "textAdventure.vlm.endpoint": "VLM 提供商的端點 URL。",
        "textAdventure.bgm.enabled": "自動背景音樂。GM 將根據 game_state.json 中的 'bgm' 或 'mood' 欄位選擇曲目。",
        "textAdventure.bgm.manifestPath": "BGM 清單 JSON 的路徑。留空使用工作區根目錄下的 'bgm.json'。",
        "textAdventure.bgm.volume": "預設 BGM 音量 (0-100)。",
        "textAdventure.sfx.enabled": "啟用單次音效。GM 透過 game_state.json 中的 'sfx' 欄位觸發音效。",
        "textAdventure.sfx.manifestPath": "SFX 清單 JSON 的路徑。",
        "textAdventure.sfx.volume": "預設音效音量 (0-100)。",
        "textAdventure.mediaAgent.enabled": "啟用後台 MediaAgent 管道（包含非同步 ComfyUI 生成）。",
        "textAdventure.mediaAgent.autoImage": "當 GM 條目包含 imagePrompt 且無圖像時，在後台非同步佇列中生成 ComfyUI 圖像。",
        "textAdventure.mediaAgent.maxImageQueue": "圖像生成作業的最大佇列數。",
        "textAdventure.remotePlay.port": "遠端聯機 HTTP/WebSocket 伺服器連接埠。",
        "textAdventure.remotePlay.bindAddress": "遠端聯機綁定的 IP 地址。允許 LAN 存取請設為 0.0.0.0（警告：將暴露給網路），本機限制設為 127.0.0.1。",
        "textAdventure.remotePlay.maxClients": "最大 WebSocket 聯機用戶端數量。",
        "textAdventure.remotePlay.inputCooldownMs": "每個遠端用戶端的最小輸入冷卻時間（毫秒）。",
        "textAdventure.remotePlay.defaultRole": "預設用戶端角色（player 或 spectator）。",
        "textAdventure.workspaceFolder": "多資料夾工作區中，game_state.json 所在資料夾名。留空為第一個資料夾。",
        "textAdventure.gitAutoCommitInterval": "自動將遊戲歷史提交到 Git 的轉折間隔。設為 0 停用自動提交。",
        "textAdventure.gmBridge.provider": "Webview 的玩家輸入如何發送給 GM (AI) 進行回應。",
        "textAdventure.gmBridge.python": "用於執行 Ollama/KoboldCPP 等 GM 橋接腳本的 Python 可執行檔路徑。",
        "textAdventure.gmBridge.scriptPath": "GM 橋接腳本的自訂路徑。",
        "textAdventure.gmBridge.ollama.url": "Ollama API 基底 URL。",
        "textAdventure.gmBridge.ollama.model": "Ollama 模型名稱。",
        "textAdventure.gmBridge.koboldcpp.url": "KoboldCPP API 基底 URL。",
        "textAdventure.gmBridge.openRouter.apiKey": "（不推薦）OpenRouter API 金鑰。推薦使用命令儲存至 VS Code 安全儲存中。",
        "textAdventure.gmBridge.openRouter.model": "要使用的 OpenRouter 模型名稱。",
        "textAdventure.gmBridge.command": "gmBridge.provider=command 時的可執行檔路徑。",
        "textAdventure.gmBridge.commandArgs": "自訂 GM 命令參數清單。",
        "textAdventure.grokBridge.enabled": "自動將 Webview 玩家輸入發送給 Grok Build (headless 模式)。",
        "textAdventure.grokBridge.command": "Grok CLI 路徑。",
        "textAdventure.grokBridge.autoApprove": "向 Grok Build 傳遞 `--always-approve` 以免除工具確認提示（警告：啟用此項有安全隱患）。",
        "textAdventure.grokBridge.fallbackToClipboard": "當 Grok 呼叫失敗時，將輸入複製到剪貼簿作為備用。",
        "textAdventure.archive.autoPrompt": "當日誌變長時，建議將舊的歷史回合存檔為傳奇（Saga）章節。",
        "textAdventure.archive.thresholdSmallContext": "適用於 Ollama / KoboldCPP 等小上下文模型的存檔建議閾值回合數。",
        "textAdventure.archive.thresholdLargeContext": "適用於 Grok / Gemini 等大上下文模型的存檔建議閾值回合數。",
        "textAdventure.archive.remindEvery": "達到閾值後，每隔多少回合再次提醒存檔。",
        "textAdventure.worldForge.defaultRegionCount": "生成新 World Forge 時的預設區域（Region）數量。",
        "textAdventure.worldForge.defaultFactionCount": "生成新 World Forge 時的預設勢力（Faction）數量。",
        "textAdventure.worldForge.defaultNpcCount": "生成新 World Forge 時的預設 NPC 數量。",
        "textAdventure.worldForge.llmEnrich": "在生成 World Forge 時，使用 LLM 自動為各個區域、勢力和 NPC 添加詳細設定與背景故事進行擴展。",
        "textAdventure.memory.backend": "NPC 註冊表及世界狀態的語義記憶索引後端。"
    }

    # Process all keys
    for i, cmd in enumerate(data.get("contributes", {}).get("commands", [])):
        cmd_id = cmd["command"]
        key = f"command.{cmd_id.replace('textadventure.', '')}"
        
        nls_en[key] = cmd["title"]
        nls_ja[key] = cmd_ja.get(cmd_id, cmd["title"])
        nls_zh_cn[key] = cmd_zh_cn.get(cmd_id, cmd["title"])
        nls_zh_tw[key] = cmd_zh_tw.get(cmd_id, cmd["title"])
        
        data["contributes"]["commands"][i]["title"] = f"%{key}%"

    properties = data.get("contributes", {}).get("configuration", {}).get("properties", {})
    for prop_name, prop in properties.items():
        key = f"config.{prop_name}.description"
        
        desc = prop.get("description", "")
        if desc:
            nls_en[key] = desc
            nls_ja[key] = config_ja.get(prop_name, desc)
            nls_zh_cn[key] = config_zh_cn.get(prop_name, desc)
            nls_zh_tw[key] = config_zh_tw.get(prop_name, desc)
            prop["description"] = f"%{key}%"
            
        markdown_desc = prop.get("markdownDescription", "")
        if markdown_desc:
            md_key = f"config.{prop_name}.markdownDescription"
            nls_en[md_key] = markdown_desc
            nls_ja[md_key] = config_ja.get(prop_name, markdown_desc)
            nls_zh_cn[md_key] = config_zh_cn.get(prop_name, markdown_desc)
            nls_zh_tw[md_key] = config_zh_tw.get(prop_name, markdown_desc)
            prop["markdownDescription"] = f"%{md_key}%"

    # Save all JSONs
    with open('package.nls.json', 'w', encoding='utf-8') as f:
        json.dump(nls_en, f, indent=2, ensure_ascii=False)

    with open('package.nls.ja.json', 'w', encoding='utf-8') as f:
        json.dump(nls_ja, f, indent=2, ensure_ascii=False)

    with open('package.nls.zh-cn.json', 'w', encoding='utf-8') as f:
        json.dump(nls_zh_cn, f, indent=2, ensure_ascii=False)

    with open('package.nls.zh-tw.json', 'w', encoding='utf-8') as f:
        json.dump(nls_zh_tw, f, indent=2, ensure_ascii=False)

    # Save package.json
    with open(package_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print("All localization files (ja, zh-cn, zh-tw) regenerated and synchronized!")

if __name__ == '__main__':
    main()
