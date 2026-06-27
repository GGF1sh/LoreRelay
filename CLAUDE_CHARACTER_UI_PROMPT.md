# Context
I am developing an AI-driven Text Adventure / Game Master UI as a VSCode Extension called "LoreRelay".
The UI is a webview using HTML, Vanilla CSS, and Vanilla JavaScript.
I want you to act as an Expert UI/UX Designer and Frontend Engineer (Claude 3.5 Sonnet / 3.7 Sonnet level).

## Objective
1. **Add a "Character Creator / Editor" UI**:
   - Please design and implement a new modal or panel in the UI to create and edit characters.
   - **Requirements:**
     - Avatar image upload area & "Generate with ComfyUI" button.
     - Character profile/setting text areas (Name, Description, Personality, Scenario, etc.).
     - Dynamic Parameter inputs (Stats/Attributes that can be toggled by Game Rules).
     - Ability to upload/manage sprite expressions (multiple images for different emotions).
     - A "Save" button that outputs this character data. Provide the UI logic and hook `vscode.postMessage({ type: 'saveCharacter', data: payload })` so the backend can generate a SillyTavern-compatible V2/V3 Character Card (PNG with embedded JSON) or a pure JSON file.
2. **Refactor and Polish Existing UI**:
   - Review the existing UI code provided below.
   - Feel free to improve the design to be more modern, hacker-like, beautiful, and intuitive.
   - You don't need to rewrite the entire backend logic; focus on the HTML structure, CSS styling, and frontend UI interactions.

---
## Existing Codebase

Below is the current frontend codebase (HTML, CSS, JS) for your reference.

### webview/index.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src {{cspSource}} https: data: blob:; media-src {{cspSource}} https: data: blob:; style-src {{cspSource}} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-{{nonce}}'; connect-src 'none';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="{{styleUri}}" />
  <title>LoreRelay</title>
</head>
<body>
  <div id="bg-layer"></div>
  <div id="sprite-layer"></div>
  <div id="bg-overlay"></div>

  <div id="app">
    <div id="chat-area">
      <div id="chat-header">
        <span class="header-icon">⚔️</span>
        <span data-i18n="webview.chat.header">Adventure Log</span>
        <div id="locale-wrap">
          <label for="locale-select" data-i18n="webview.locale.label">🌐 Language</label>
          <select id="locale-select" title="Language">
            <option value="ja">日本語</option>
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
          </select>
        </div>
        <div id="img-gen-wrap">
          <button id="img-gen-settings-btn" class="glass-btn" data-i18n-title="webview.imageGen.open" title="Image Gen Settings">🎨</button>
        </div>
        <div id="game-rules-wrap">
          <button id="game-rules-settings-btn" class="glass-btn" title="Game Rules">⚙️</button>
        </div>
        <div id="remote-play-wrap">
          <button id="remote-play-btn" class="glass-btn" data-i18n-title="webview.remotePlay.toggle" title="Remote Play">📱</button>
        </div>
        <div id="tts-wrap">
          <button id="tts-toggle-btn" class="glass-btn" title="Voice Narration">🔊</button>
          <div id="tts-menu" class="tts-menu-popup hidden">
            <h4 data-i18n="webview.tts.title">Voice Narration</h4>
            <div class="tts-menu-row">
              <label for="tts-enabled-cb" data-i18n="webview.tts.enabled">Enabled</label>
              <input type="checkbox" id="tts-enabled-cb" />
            </div>
            <div class="tts-menu-row">
              <label for="tts-speed-slider" data-i18n="webview.tts.speed">Speed</label>
              <input type="range" id="tts-speed-slider" min="0.5" max="2.0" step="0.1" value="1.0" />
              <span id="tts-speed-val">1.0x</span>
            </div>
            <div class="tts-menu-row">
              <label for="tts-volume-slider" data-i18n="webview.tts.volume">Volume</label>
              <input type="range" id="tts-volume-slider" min="0" max="1" step="0.1" value="0.8" />
              <span id="tts-volume-val">80%</span>
            </div>
          </div>
        </div>
      </div>
      <div id="chat-log"></div>
      <div id="game-over-overlay" class="game-over-overlay hidden">
        <div class="game-over-card">
          <h3 id="game-over-title"></h3>
          <p id="game-over-message"></p>
          <p class="game-over-hint" data-i18n="webview.gameOver.restartHint">Load a scenario pack or edit game_state.json to start a new adventure.</p>
        </div>
      </div>
      <div id="options-bar"></div>
      <div id="authors-note-row">
        <input type="text" id="authors-note-input" data-i18n-placeholder="webview.authorsNote.placeholder" placeholder="Author's Note (steers next GM turn only)" />
      </div>
      <div id="quick-reply-bar">
        <button class="qr-btn" id="qr-undo"       data-i18n="webview.quickReply.undo">⏪ Undo</button>
        <button class="qr-btn" id="qr-retry"      data-i18n="webview.quickReply.retry">🔄 Retry</button>
        <button class="qr-btn" id="qr-checkpoint" data-i18n="webview.quickReply.checkpoint">💾 Checkpoint</button>
        <button class="qr-btn" id="qr-summary"    data-i18n="webview.quickReply.summary">📝 Summary</button>
        <button class="qr-btn" id="qr-genimage"   data-i18n="webview.quickReply.genImage">🎨 Gen Image</button>
        <button class="qr-btn" id="qr-loadpack"   data-i18n="webview.quickReply.loadPack">📂 Load Pack</button>
        <button class="qr-btn" id="qr-archive"    data-i18n="webview.quickReply.archive">📖 Archive</button>
        <button class="qr-btn" id="qr-export"     data-i18n="webview.quickReply.export">🌐 Export HTML</button>
        <button class="qr-btn" id="qr-forcespeak" data-i18n="webview.quickReply.forceSpeak">🪄 Speak as...</button>
        <button class="qr-btn" id="qr-questflow"  data-i18n="webview.quickReply.questFlow">🗺️ Quest Flow</button>
        <button class="qr-btn" id="qr-relations"  data-i18n="webview.quickReply.relations">🕸️ Relations</button>
      </div>
      <div id="input-area">
        <input type="text" id="free-input" data-i18n-placeholder="webview.input.placeholder" placeholder="Free input (Enter to send to GM)" />
        <button id="mic-btn" class="glass-btn" data-i18n-title="webview.stt.title" title="Voice input">🎤</button>
        <button id="send-btn" data-i18n="webview.input.send">Send</button>
        <button id="undo-btn" data-i18n="webview.input.undo" title="Undo last turn">⏪ Undo</button>
        <button id="regen-btn" data-i18n="webview.input.regenerate" title="Regenerate last GM response">🔄</button>
        <button id="img-btn" data-i18n-title="webview.input.imageTitle" title="Generate image for this scene">🎨</button>
      </div>
    </div>

    <div id="resizer" title="Drag to resize"></div>

    <!-- 右：ステータスパネル -->
    <div id="status-area">
      <!-- タブヘッダー -->
      <div id="status-tabs" class="tabs-header">
        <button class="tab-btn active" data-target="pane-status"><span class="tab-icon">🏰</span><span class="tab-text" data-i18n="webview.tab.status">Adventure Status</span></button>
        <button class="tab-btn" data-target="pane-character"><span class="tab-icon">👤</span><span class="tab-text" data-i18n="webview.tab.character">Character Profile</span></button>
        <button class="tab-btn" data-target="pane-inspector"><span class="tab-icon">🔍</span><span class="tab-text" data-i18n="webview.tab.inspector">🔍 Inspector</span></button>
        <button class="tab-btn" data-target="pane-lorebook"><span class="tab-icon">📖</span><span class="tab-text" data-i18n="webview.tab.lorebook">📖 Lorebook</span></button>
        <button class="tab-btn" data-target="pane-memory"><span class="tab-icon">🧠</span><span class="tab-text" data-i18n="webview.tab.memory">🧠 Memory</span></button>
        <button class="tab-btn" data-target="pane-director"><span class="tab-icon">🎬</span><span class="tab-text" data-i18n="webview.tab.director">🎬 Director</span></button>
        <button class="tab-btn" data-target="pane-party"><span class="tab-icon">👥</span><span class="tab-text" data-i18n="webview.tab.party">👥 Party</span></button>
        <button class="tab-btn" data-target="pane-ooc"><span class="tab-icon">💬</span><span class="tab-text" data-i18n="webview.tab.ooc">💬 OOC</span></button>
      </div>

      <!-- ペイン 1: Adventure Status (既存のステータス・ダイス・BGM等) -->
      <div id="pane-status" class="tab-pane active">
        <!-- ステータス表示 -->
        <div id="status-content">
        <div class="status-row" id="status-row-location">
          <span class="status-label" data-i18n="webview.status.location">📍 Location</span>
          <span id="status-location" class="status-value">---</span>
        </div>
        <div class="status-row" id="status-row-time">
          <span class="status-label" data-i18n="webview.status.time">🕐 Time</span>
          <span id="status-time" class="status-value">---</span>
        </div>
        <div class="status-row" id="status-row-funds">
          <span class="status-label" data-i18n="webview.status.funds">💰 Funds</span>
          <span id="status-funds" class="status-value">---</span>
        </div>

        <div id="dynamic-resources-container"></div>

        <div class="status-block" id="status-block-condition">
          <span class="status-label" data-i18n="webview.status.condition">✨ Condition</span>
          <div id="status-condition-list" class="tag-list">
            <span class="tag-item empty-tag" style="color:var(--text-dim);">-</span>
          </div>
        </div>

        <div class="status-block" id="status-block-inventory">
          <span class="status-label" data-i18n="webview.status.inventory">🎒 Inventory</span>
          <div id="status-inventory-list" class="tag-list">
            <span class="tag-item empty-tag" style="color:var(--text-dim);">-</span>
          </div>
        </div>

        <div class="status-block" id="status-block-skills">
          <span class="status-label" data-i18n="webview.status.skills">⚔️ Skills</span>
          <div id="status-skills-list" class="tag-list">
            <span class="tag-item empty-tag" style="color:var(--text-dim);">-</span>
          </div>
        </div>
      </div>

      <div id="checkpoint-header">
        <span data-i18n="webview.checkpoint.header">📍 Checkpoints &amp; Rewind</span>
      </div>
      <div id="checkpoint-area">
        <div class="checkpoint-actions">
          <button id="checkpoint-save-btn" data-i18n="webview.checkpoint.save">💾 Save</button>
          <select id="rewind-select">
            <option value="" data-i18n="webview.checkpoint.rewind">⏪ Rewind to turn…</option>
          </select>
          <button id="rewind-btn" data-i18n="webview.checkpoint.restore">Restore</button>
        </div>
        <ul id="checkpoint-list"></ul>
        <div id="checkpoint-empty" class="checkpoint-empty" data-i18n="webview.checkpoint.empty">No saved checkpoints yet.</div>
      </div>

      <div id="dice-header">
        <span data-i18n="webview.dice.header">🎲 Dice Roller</span>
      </div>
      <div id="dice-area">
        <div id="dice-presets">
          <button class="dice-btn" data-sides="4">d4</button>
          <button class="dice-btn" data-sides="6">d6</button>
          <button class="dice-btn" data-sides="8">d8</button>
          <button class="dice-btn" data-sides="10">d10</button>
          <button class="dice-btn" data-sides="12">d12</button>
          <button class="dice-btn" data-sides="20">d20</button>
          <button class="dice-btn" data-sides="100">d100</button>
        </div>
        <div id="dice-custom-row">
          <input type="number" id="dice-count" value="1" min="1" max="99" />
          <span>d</span>
          <input type="number" id="dice-sides" value="6" min="2" max="9999" />
          <button id="dice-custom-btn" data-i18n="webview.dice.roll">Roll</button>
        </div>
        <div id="dice-result">---</div>
        <button id="dice-send-gm" type="button" data-i18n="webview.dice.sendGm" data-i18n-title="webview.dice.sendGmTitle">📤 Send to GM</button>
        <div id="dice-log"></div>
      </div>

      <div id="calc-header">
        <span data-i18n="webview.calc.header">🔢 Calculator</span>
      </div>
      <div id="calc-area">
        <input type="text" id="calc-input" data-i18n-placeholder="webview.calc.placeholder" placeholder="e.g. 15 * 3 + 8" />
        <button id="calc-btn" data-i18n="webview.calc.button">Calc</button>
        <div id="calc-result">---</div>
        <div id="calc-history"></div>
      </div>

      <div id="bgm-header">
        <span data-i18n="webview.bgm.header">🎵 BGM &amp; SE</span>
        <span id="bgm-mode" data-i18n-title="webview.bgm.autoTitle" title="GM switches BGM automatically">AUTO</span>
      </div>
      <div id="bgm-area">
        <div id="bgm-now">♪ ---</div>
        <div id="bgm-controls">
          <button id="bgm-toggle" data-i18n-title="webview.bgm.playPause" title="Play / Pause">▶</button>
          <input type="range" id="bgm-volume" min="0" max="100" value="50" data-i18n-title="webview.bgm.volume" title="BGM volume" />
          <button id="bgm-mute" data-i18n-title="webview.bgm.mute" title="Toggle BGM mute">🔊</button>
        </div>
        <div id="bgm-list"></div>
        <div id="bgm-empty" data-i18n="webview.bgm.empty">No bgm.json or no tracks registered</div>
        <div id="sfx-row">
          <span id="sfx-label" data-i18n="webview.sfx.label">🔔 SE</span>
          <input type="range" id="sfx-volume" min="0" max="100" value="70" data-i18n-title="webview.sfx.volume" title="SFX volume" />
          <button id="sfx-mute" data-i18n-title="webview.sfx.mute" title="Toggle SFX mute">🔔</button>
        </div>
      </div>

      <div id="gallery-header">
        <span data-i18n="webview.gallery.header">🖼️ Scene Gallery</span>
      </div>
      <div id="gallery"></div>

      <div id="theme-header">
        <span data-i18n="webview.theme.header">🌍 World Theme</span>
        <div class="theme-selector">
          <label data-i18n="webview.status.theme">Theme:</label>
          <button class="theme-btn active" data-theme="fantasy">Fantasy</button>
          <button class="theme-btn" data-theme="cyberpunk">Cyberpunk</button>
          <button class="theme-btn" data-theme="scifi">Sci-Fi</button>
          <button class="theme-btn" data-theme="ff14">FF14</button>
          <button class="theme-btn" data-theme="postapoc">Post-Apocalypse</button>
          <button class="theme-btn" data-theme="modern">Modern</button>
        </div>

        <!-- アーカイブ促しバナー（履歴が閾値超え時） -->
        <div id="archive-suggest-banner" class="archive-suggest-banner" style="display: none;">
          <span id="archive-suggest-text"></span>
          <button id="archive-suggest-btn" type="button" data-i18n="webview.saga.archiveNow">Archive now</button>
          <button id="archive-suggest-dismiss" type="button" title="Dismiss">×</button>
        </div>

        <!-- あらすじ (Summary) -->
        <div id="summary-container" style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; flex-wrap: wrap;">
            <label data-i18n="webview.summary.label" style="color: var(--accent); font-weight: bold; font-size: 13px;">📜 Story Summary</label>
            <div style="display: flex; gap: 6px;">
              <button id="summarize-btn" data-i18n="webview.summary.generate" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">♻️ Generate Summary</button>
              <button id="archive-saga-btn" data-i18n="webview.saga.archive" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">📖 Archive Chapter</button>
            </div>
          </div>
          <textarea id="story-summary" rows="4" data-i18n-placeholder="webview.summary.placeholder" placeholder="Story synopsis appears here. You can edit it manually." style="width: 100%; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); color: var(--text); padding: 8px; border-radius: 4px; font-size: 13px; resize: vertical; box-sizing: border-box;"></textarea>
        </div>

      </div> <!-- /pane-status -->

      <!-- ペイン 2: Character Profile -->
      <div id="pane-character" class="tab-pane" style="display: none;">
        <div class="char-toolbar">
          <select id="char-select">
            <option value="new" data-i18n="webview.character.newOption">-- New Character --</option>
          </select>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 12px; color: var(--text);">
            <input type="checkbox" id="char-party-cb" />
            <span data-i18n="webview.character.partyJoin">Join party</span>
          </label>
          <button id="char-save-btn" data-i18n="webview.character.save">💾 Save</button>
        </div>

        <div class="char-portrait-container">
          <img id="char-portrait-img" class="char-portrait" src="" alt="Portrait" style="display: none;" />
          <div id="char-portrait-placeholder" class="char-portrait placeholder" data-i18n="webview.character.noPortrait">No Portrait</div>
          <div class="char-portrait-actions">
            <button id="char-import-st-btn" data-i18n="webview.character.importSt">📦 Import ST Card</button>
            <button id="char-upload-btn" data-i18n="webview.character.upload">📁 Upload</button>
            <button id="char-generate-btn" data-i18n="webview.character.generate">🎨 Generate Portrait</button>
          </div>
        </div>

        <div class="char-form">
          <label data-i18n="webview.character.nameLabel">Name</label>
          <input type="text" id="char-name" data-i18n-placeholder="webview.character.namePlaceholder" placeholder="Character name" />

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; margin-bottom: 4px;">
            <label data-i18n="webview.character.equipmentLabel" style="margin: 0;">Equipped Items</label>
            <button id="char-equip-notify-btn" class="small-btn primary" data-i18n="webview.character.notifyGm">📤 Equip &amp; Notify GM</button>
          </div>
          <div class="img-gen-row" style="margin-bottom: 8px;">
            <input type="text" id="char-equip-weapon" class="img-gen-input" data-i18n-placeholder="webview.character.equipWeapon" placeholder="Weapon" />
            <input type="text" id="char-equip-armor" class="img-gen-input" data-i18n-placeholder="webview.character.equipArmor" placeholder="Armor" />
            <input type="text" id="char-equip-accessory" class="img-gen-input" data-i18n-placeholder="webview.character.equipAcc" placeholder="Accessory" />
          </div>

          <label data-i18n="webview.character.controlledByLabel">Controlled By</label>
          <select id="char-controlled-by">
            <option value="gm" data-i18n="webview.character.controlledByGm">GM</option>
            <option value="ai" data-i18n="webview.character.controlledByAi">AI Companion</option>
            <option value="player" data-i18n="webview.character.controlledByPlayer">Player</option>
          </select>

          <label data-i18n="webview.character.llmProvider">LLM Provider (Optional)</label>
          <select id="char-llm-provider">
            <option value="">(Default)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama</option>
            <option value="koboldcpp">KoboldCPP</option>
          </select>

          <label data-i18n="webview.character.llmModel">LLM Model (Optional)</label>
          <input type="text" id="char-llm-model" placeholder="e.g. anthropic/claude-3-haiku" />

          <label data-i18n="webview.character.descLabel">Appearance &amp; Background</label>
          <textarea id="char-desc" rows="4" data-i18n-placeholder="webview.character.descPlaceholder" placeholder="Description used in GM prompts..."></textarea>

          <label data-i18n="webview.character.personalityLabel">Personality</label>
          <textarea id="char-personality" rows="2" data-i18n-placeholder="webview.character.personalityPlaceholder" placeholder="Personality and speech style..."></textarea>
        </div>
      </div> <!-- /pane-character -->

      <!-- ペイン 3: Turn Inspector -->
      <div id="pane-inspector" class="tab-pane" style="display: none;">
        <p id="inspector-empty-text" class="empty-text" data-i18n="webview.inspector.empty">Complete a GM turn to inspect dice, patches, and lore triggers.</p>
        <div id="inspector-content" class="hidden">
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.turnId">Turn</h4>
            <div id="inspector-turn-id" class="inspector-item"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.integrity">State integrity</h4>
            <div id="inspector-integrity" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.diceLedger">Dice ledger</h4>
            <div id="inspector-dice-ledger" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.statePatch">State patches</h4>
            <div id="inspector-state-patch" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.lorebook">Triggered lore</h4>
            <div id="inspector-lorebook" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.promptContext">Prompt context (last GM call)</h4>
            <div id="inspector-prompt-summary" class="inspector-item empty-text"></div>
            <div id="inspector-prompt-sections" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.memoryMatches">Memory matches</h4>
            <div id="inspector-memory-matches" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.loreMatches">Lorebook matches (this turn)</h4>
            <div id="inspector-lore-matches" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.schemaErrors">Schema errors</h4>
            <div id="inspector-schema-errors" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.inspector.hiddenState">Hidden State (GM Only)</h4>
            <pre id="inspector-hidden-state" class="inspector-item" style="white-space: pre-wrap; font-size: 12px;"></pre>
          </div>
        </div>
      </div> <!-- /pane-inspector -->

      <!-- ペイン: Lorebook Editor -->
      <div id="pane-lorebook" class="tab-pane" style="display: none;">
        <div class="lorebook-toolbar">
          <button id="lorebook-add-btn" type="button" class="small-btn" data-i18n="webview.lorebook.addEntry">+ Add entry</button>
          <button id="lorebook-save-btn" type="button" class="small-btn primary" data-i18n="webview.lorebook.saveAll">Save lorebook</button>
          <span id="lorebook-dirty" class="lorebook-dirty hidden" data-i18n="webview.lorebook.unsaved">Unsaved changes</span>
        </div>
        <p id="lorebook-meta" class="empty-text" data-i18n="webview.lorebook.emptyFile">No lorebook.json in workspace</p>
        <div id="lorebook-list" class="lorebook-list"></div>
      </div> <!-- /pane-lorebook -->

      <!-- ペイン: Memory Bank -->
      <div id="pane-memory" class="tab-pane" style="display: none;">
        <div class="memory-toolbar">
          <label for="memory-backend-select" data-i18n="webview.memory.backendLabel">Backend</label>
          <select id="memory-backend-select">
            <option value="auto">auto</option>
            <option value="tfidf">tfidf</option>
            <option value="chromadb">chromadb</option>
          </select>
          <button id="memory-rebuild-btn" type="button" class="small-btn" data-i18n="webview.memory.rebuild">Rebuild index</button>
        </div>
        <p id="memory-status-meta" class="empty-text"></p>
        <div class="memory-search-row">
          <input id="memory-hint-input" type="text" data-i18n-placeholder="webview.memory.hintPlaceholder" placeholder="Search hint (recent narrative + action)..." />
          <button id="memory-search-btn" type="button" class="small-btn primary" data-i18n="webview.memory.search">Search</button>
        </div>
        <p id="memory-token-budget" class="empty-text"></p>
        <div id="memory-search-results" class="memory-search-results"></div>
      </div> <!-- /pane-memory -->

      <!-- ペイン: Scenario Director -->
      <div id="pane-director" class="tab-pane" style="display: none;">
        <p id="director-empty" class="empty-text" data-i18n="webview.director.empty">Load a scenario pack with a director block in scenario.json.</p>
        <div id="director-content" class="hidden">
          <p id="director-live-badge" class="lorebook-dirty hidden" data-i18n="webview.director.liveOverrides">Live progression (game_state.director)</p>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.title">Scenario</h4>
            <div id="director-title" class="inspector-item"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.act">Act / Chapter</h4>
            <div id="director-act" class="inspector-item"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.scene">Scene</h4>
            <div id="director-scene" class="inspector-item"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.objective">Current objective</h4>
            <div id="director-objective" class="inspector-item"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.guidance">Guidance</h4>
            <div id="director-guidance" class="inspector-item"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.success">Success conditions</h4>
            <div id="director-success" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.fail">Fail conditions</h4>
            <div id="director-fail" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.endings">Ending flags</h4>
            <div id="director-endings" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.achieved">Achieved endings</h4>
            <div id="director-achieved" class="inspector-list"></div>
          </div>
          <div class="inspector-section">
            <h4 data-i18n="webview.director.encounters">Optional encounters</h4>
            <div id="director-encounters" class="inspector-list"></div>
          </div>
        </div>
      </div> <!-- /pane-director -->

      <!-- ペイン: Party Director -->
      <div id="pane-party" class="tab-pane" style="display: none;">
        <p id="party-empty" class="empty-text" data-i18n="webview.party.empty">Add characters to the party to configure speech and relationships.</p>
        <div id="party-content" class="hidden">
          <p id="party-live-badge" class="lorebook-dirty hidden" data-i18n="webview.party.liveOverrides">Live overrides (game_state.partyDirector)</p>
          <p id="party-dirty-badge" class="lorebook-dirty hidden" data-i18n="webview.party.unsaved">Unsaved changes</p>
          <div class="party-global-row">
            <label class="party-flag-label">
              <input type="checkbox" id="party-banter-cb" checked />
              <span data-i18n="webview.party.banter">NPC banter enabled</span>
            </label>
            <label class="party-flag-label">
              <input type="checkbox" id="party-quiet-cb" />
              <span data-i18n="webview.party.quietCombat">Combat quiet mode</span>
            </label>
          </div>
          <div id="party-members-list" class="party-members-list"></div>
          <button id="party-save-btn" type="button" class="small-btn primary" data-i18n="webview.party.save">Save party_director.json</button>
        </div>
      </div> <!-- /pane-party -->

      <!-- ペイン 4: OOC Sidekick -->
      <div id="pane-ooc" class="tab-pane" style="display: none;">
        <div id="ooc-log" class="ooc-log" style="flex: 1; overflow-y: auto; margin-bottom: 1rem; border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 0.5rem; background: var(--vscode-editor-background);">
          <div class="empty-text" data-i18n="webview.ooc.empty">OOC commentary will appear here after GM turns...</div>
        </div>
      </div>

    </div>
  </div>

  <div id="remote-play-backdrop" class="img-gen-backdrop hidden"></div>
  <aside id="remote-play-panel" class="remote-play-panel hidden" aria-hidden="true">
    <div class="img-gen-panel-header">
      <h3 data-i18n="webview.remotePlay.panelTitle">Remote Play</h3>
      <button type="button" id="remote-play-close" class="glass-btn" title="Close">✕</button>
    </div>
    <div class="remote-play-body">
      <div class="remote-play-qr-row">
        <div class="remote-play-qr-block">
          <h4 data-i18n="webview.remotePlay.playerJoin">Player join</h4>
          <p id="remote-play-player-url" class="remote-play-url"></p>
          <button type="button" id="remote-play-copy-player" class="small-btn" data-i18n="webview.remotePlay.copyPlayer">Copy player URL</button>
        </div>
        <div class="remote-play-qr-block">
          <h4 data-i18n="webview.remotePlay.spectatorJoin">Spectator join</h4>
          <p id="remote-play-spectator-url" class="remote-play-url"></p>
          <button type="button" id="remote-play-copy-spectator" class="small-btn" data-i18n="webview.remotePlay.copySpectator">Copy spectator URL</button>
        </div>
      </div>
      <div class="remote-play-clients-wrap">
        <h4 data-i18n="webview.remotePlay.connected">Connected clients</h4>
        <div id="remote-play-clients" class="remote-play-clients"></div>
      </div>
      <button type="button" id="remote-play-stop-btn" class="small-btn" data-i18n="webview.remotePlay.stop">Stop server</button>
    </div>
  </aside>

  <div id="img-gen-backdrop" class="img-gen-backdrop hidden"></div>
  <aside id="img-gen-panel" class="img-gen-panel hidden" aria-hidden="true">
    <div class="img-gen-panel-header">
      <h3 data-i18n="webview.imageGen.title">Image Gen Settings</h3>
      <button type="button" id="img-gen-panel-close" class="glass-btn" data-i18n-title="webview.imageGen.close" title="Close">✕</button>
    </div>
    <div class="img-gen-panel-body">
      <p class="img-gen-hint" data-i18n="webview.imageGen.hint">Saved to image_gen_config.json in your workspace. 0 = workflow default.</p>
      <label data-i18n="webview.imageGen.checkpoint">Checkpoint</label>
      <input type="text" id="ig-checkpoint" class="img-gen-input" data-field="checkpoint" />
      <label data-i18n="webview.imageGen.mode">Mode</label>
      <select id="ig-mode" class="img-gen-input" data-field="mode">
        <option value="illustrious">illustrious</option>
        <option value="pony">pony</option>
        <option value="natural">natural</option>
        <option value="standard">standard</option>
      </select>
      <div class="img-gen-row">
        <div>
          <label data-i18n="webview.imageGen.steps">Steps</label>
          <input type="number" id="ig-steps" class="img-gen-input" data-field="steps" min="0" max="150" />
        </div>
        <div>
          <label data-i18n="webview.imageGen.cfg">CFG</label>
          <input type="number" id="ig-cfg" class="img-gen-input" data-field="cfg" min="0" max="30" step="0.5" />
        </div>
      </div>
      <div class="img-gen-row">
        <div>
          <label data-i18n="webview.imageGen.width">Width</label>
          <input type="number" id="ig-width" class="img-gen-input" data-field="width" min="0" max="2048" step="64" />
        </div>
        <div>
          <label data-i18n="webview.imageGen.height">Height</label>
          <input type="number" id="ig-height" class="img-gen-input" data-field="height" min="0" max="2048" step="64" />
        </div>
      </div>
      <label data-i18n="webview.imageGen.sampler">Sampler</label>
      <input type="text" id="ig-sampler" class="img-gen-input" data-field="samplerName" />
      <label data-i18n="webview.imageGen.scheduler">Scheduler</label>
      <input type="text" id="ig-scheduler" class="img-gen-input" data-field="scheduler" />
      <label data-i18n="webview.imageGen.positivePrefix">Positive prefix</label>
      <textarea id="ig-pos-prefix" class="img-gen-textarea" data-field="positivePrefix" rows="2"></textarea>
      <label data-i18n="webview.imageGen.positiveSuffix">Positive suffix</label>
      <textarea id="ig-pos-suffix" class="img-gen-textarea" data-field="positiveSuffix" rows="2"></textarea>
      <label data-i18n="webview.imageGen.negative">Negative prompt</label>
      <textarea id="ig-negative" class="img-gen-textarea" data-field="negativePrompt" rows="3"></textarea>
      <details class="img-gen-templates">
        <summary data-i18n="webview.imageGen.templates">Prompt templates</summary>
        <label data-i18n="webview.imageGen.tplScene">Scene</label>
        <textarea id="ig-tpl-scene" class="img-gen-textarea" data-tpl="scene" rows="2"></textarea>
        <label data-i18n="webview.imageGen.tplPortrait">Portrait</label>
        <textarea id="ig-tpl-portrait" class="img-gen-textarea" data-tpl="portrait" rows="2"></textarea>
        <label data-i18n="webview.imageGen.tplBackground">Background</label>
        <textarea id="ig-tpl-background" class="img-gen-textarea" data-tpl="background" rows="2"></textarea>
        <label data-i18n="webview.imageGen.tplFreeform">Freeform</label>
        <textarea id="ig-tpl-freeform" class="img-gen-textarea" data-tpl="freeform" rows="2"></textarea>
      </details>
      <div id="img-gen-saved" class="img-gen-saved hidden" data-i18n="webview.imageGen.saved">Saved</div>
    </div>
  </aside>

  <div id="game-rules-backdrop" class="img-gen-backdrop hidden"></div>
  <aside id="game-rules-panel" class="img-gen-panel hidden" aria-hidden="true">
    <div class="img-gen-panel-header">
      <h3 data-i18n="webview.gameRules.title">Game Rules</h3>
      <button type="button" id="game-rules-panel-close" class="glass-btn" data-i18n-title="webview.gameRules.close" title="Close">✕</button>
    </div>
    <div class="img-gen-panel-body">
      <p class="img-gen-hint" data-i18n="webview.gameRules.hint">Saved to game_rules.json in your workspace.</p>
      
      <div class="img-gen-row" style="align-items: center;">
        <label for="gr-enable-rpg" data-i18n="webview.gameRules.enableRpg">Enable RPG Mechanics (HP/MP)</label>
        <input type="checkbox" id="gr-enable-rpg" data-field="enableRpgMechanics" />
      </div>

      <div class="img-gen-row">
        <div>
          <label data-i18n="webview.gameRules.defaultHp">Default Max HP</label>
          <input type="number" id="gr-default-hp" class="img-gen-input" data-field="defaultMaxHp" min="1" max="9999" />
        </div>
        <div>
          <label data-i18n="webview.gameRules.defaultMp">Default Max MP</label>
          <input type="number" id="gr-default-mp" class="img-gen-input" data-field="defaultMaxMp" min="0" max="9999" />
        </div>
      </div>

      <label data-i18n="webview.gameRules.diceDifficulty">Dice Difficulty</label>
      <select id="gr-dice-diff" class="img-gen-input" data-field="diceDifficulty">
        <option value="Easy">Easy</option>
        <option value="Normal" selected>Normal</option>
        <option value="Hard">Hard</option>
      </select>

      <div class="img-gen-row" style="margin-top: 1rem; border-top: 1px solid var(--vscode-panel-border); padding-top: 0.5rem;">
        <h4 style="margin: 0 0 0.5rem 0;" data-i18n="webview.gameRules.advanced">Advanced AI Rules</h4>
      </div>

      <div class="img-gen-row" style="align-items: center; margin-bottom: 0.5rem;">
        <label for="gr-skill-commentary" title="Skills have personalities and comment on checks (Disco Elysium style)" data-i18n="webview.gameRules.skillCommentary">Enable Skill Commentary</label>
        <input type="checkbox" id="gr-skill-commentary" data-field="skillCommentary" />
      </div>

      <div class="img-gen-row" style="align-items: center; margin-bottom: 0.5rem;">
        <label for="gr-bg-sim" title="World progresses even when players are idle" data-i18n="webview.gameRules.bgSim">Enable Background Simulation</label>
        <input type="checkbox" id="gr-bg-sim" data-field="backgroundSimulation" />
      </div>

      <div class="img-gen-row" style="align-items: center; margin-bottom: 0.5rem;">
        <label for="gr-auto-lore" title="Automatically create Lorebook entries from new nouns" data-i18n="webview.gameRules.autoLore">Enable Auto Lorebook Growth</label>
        <input type="checkbox" id="gr-auto-lore" data-field="autoLorebookGrowth" />
      </div>

      <div id="game-rules-saved" class="img-gen-saved hidden" data-i18n="webview.gameRules.saved">Saved</div>
    </div>
  </aside>

  <script nonce="{{nonce}}" src="{{scriptUri}}"></script>
  <script nonce="{{nonce}}" src="{{mermaidUri}}"></script>
  <script nonce="{{nonce}}">
    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    }
  </script>
</body>
</html>

```

### webview/styles\00-base.css
```css
/* ============================
   LoreRelay - UI
   Glassmorphism Dark Theme
   ============================ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+JP:wght@300;400;500;700&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --glass-bg: rgba(12, 12, 20, 0.65);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-glow: rgba(80, 160, 255, 0.15);
  --accent: #4f8ef7;
  --accent-hover: #6da3ff;
  --accent-dim: rgba(79, 142, 247, 0.3);
  --text: #e8eaed;
  --text-dim: #9aa0a6;
  --gm-color: #7cb3ff;
  --player-color: #a8d8a8;
  --system-color: #ffd700;
  --danger: #ff6b6b;
  --radius: 14px;
}

body {
  font-family: 'Inter', 'Noto Sans JP', system-ui, sans-serif;
  background: #080810;
  color: var(--text);
  height: 100vh;
  overflow: hidden;
}

/* 背景画像レイヤー */
#bg-layer {
  position: fixed;
  inset: 0;
  background-size: cover;
  background-position: center;
  transition: background-image 2s ease-in-out, opacity 2s;
  z-index: 0;
}

#sprite-layer {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  max-height: 72vh;
  max-width: min(480px, 45vw);
  pointer-events: none;
  z-index: 0;
  opacity: 0;
  transition: opacity 0.6s ease;
}

#sprite-layer.visible {
  opacity: 0.92;
}

#sprite-layer img {
  width: 100%;
  height: auto;
  display: block;
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.55));
}

#sprite-layer.pos-left {
  left: 18%;
  transform: translateX(-50%);
}

#sprite-layer.pos-right {
  left: 82%;
  transform: translateX(-50%);
}

#bg-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(180deg, rgba(8,8,16,0.7) 0%, rgba(8,8,16,0.85) 100%);
  z-index: 1;
}

```

### webview/styles\10-layout-chat.css
```css
/* メインレイアウト */
#app {
  position: relative;
  z-index: 2;
  display: flex;
  height: 100vh;
  padding: 16px;
  gap: 16px;
}

#chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

#locale-wrap {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}

#locale-select {
  background: rgba(0, 0, 0, 0.35);
  color: var(--text-main);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 0.85rem;
}

/* ========= チャットエリア ========= */
#chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

/* リサイザー */
#resizer {
  width: 8px;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 10;
  margin: 0 -4px; /* 見た目の隙間を減らす */
  transition: background 0.2s;
  flex-shrink: 0;
}
#resizer:hover, #resizer.dragging {
  background: rgba(79, 142, 247, 0.4);
}

#chat-header {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  border-bottom: 1px solid var(--glass-border);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.5px;
  color: var(--text);
  background: rgba(0,0,0,0.3);
}

.header-icon {
  font-size: 18px;
}

#chat-log {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* メッセージバブル */
.msg {
  max-width: 88%;
  padding: 14px 18px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.7;
  animation: fadeIn 0.4s ease;
  white-space: pre-wrap;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.msg.gm {
  align-self: flex-start;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(124, 179, 255, 0.2);
  border-left: 3px solid var(--gm-color);
}

.msg.user {
  align-self: flex-end;
  background: rgba(79, 142, 247, 0.2);
  border: 1px solid rgba(79, 142, 247, 0.3);
  border-right: 3px solid var(--accent);
}

.msg.system {
  align-self: center;
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.15);
  color: var(--system-color);
  font-size: 13px;
  text-align: center;
  max-width: 70%;
}

.msg-sender {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 6px;
  letter-spacing: 0.3px;
}

.msg.gm .msg-sender { color: var(--gm-color); }
.msg.user .msg-sender { color: var(--player-color); }

/* メッセージ内の画像 */
.msg img.scene-img {
  max-width: 100%;
  border-radius: 8px;
  margin-top: 12px;
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: transform 0.2s;
}
.msg img.scene-img:hover {
  transform: scale(1.02);
}

/* 画像ブロック時プレースホルダ */
.scene-img-placeholder {
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px dashed var(--glass-border);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  text-align: center;
}

/* 選択肢バー */
#options-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--glass-border);
  background: rgba(0,0,0,0.2);
  min-height: 0;
}

#options-bar:empty {
  display: none;
}

.option-btn {
  background: var(--accent-dim);
  border: 1px solid rgba(79, 142, 247, 0.4);
  color: #fff;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.option-btn:hover {
  background: rgba(79, 142, 247, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 142, 247, 0.3);
}

.option-btn:active {
  transform: translateY(0);
}

/* 入力エリア */
#authors-note-row {
  padding: 0 16px 6px;
}

#authors-note-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.25);
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 12px;
  padding: 6px 10px;
}

#authors-note-input:focus {
  border-color: var(--accent);
  color: var(--text);
}

.game-over-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  z-index: 20;
  padding: 24px;
}

.game-over-overlay.hidden {
  display: none;
}

.game-over-card {
  max-width: 420px;
  background: rgba(20, 10, 10, 0.95);
  border: 1px solid rgba(220, 80, 80, 0.45);
  border-radius: 12px;
  padding: 20px 24px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.game-over-card.victory {
  border-color: rgba(80, 200, 120, 0.55);
  background: rgba(10, 30, 20, 0.95);
}

.game-over-card.victory h3 {
  color: #80ffb0;
}

.game-over-card h3 {
  margin: 0 0 12px;
  font-size: 1.4rem;
  color: #ff8080;
}

.game-over-card p {
  margin: 0 0 8px;
  line-height: 1.5;
}

.game-over-hint {
  font-size: 12px;
  color: var(--text-dim);
}

#checkpoint-area {
  padding: 8px 12px 12px;
}

.checkpoint-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.checkpoint-actions button,
.checkpoint-actions select {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

#checkpoint-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.checkpoint-item {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
}

.checkpoint-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
}

.checkpoint-delete {
  opacity: 0.75;
}

.checkpoint-empty {
  font-size: 12px;
  color: var(--text-dim);
}

```

### webview/styles\20-quickreply-messages.css
```css
/* ===== Quick Reply Bar ===== */
#quick-reply-bar {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  padding: 6px 16px 4px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
#quick-reply-bar::-webkit-scrollbar { display: none; }

.qr-btn {
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text);
  padding: 5px 11px;
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
  font-family: inherit;
  backdrop-filter: blur(4px);
}
.qr-btn:hover { background: rgba(255, 255, 255, 0.18); border-color: var(--accent); }
.qr-btn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }

/* ===== Message Action Bar ===== */
.msg-actions {
  display: none;
  gap: 2px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.msg:hover .msg-actions { display: flex; }

.msg-action-btn {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text);
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  line-height: 1.3;
}
.msg-action-btn:hover { background: rgba(255, 255, 255, 0.18); }
.msg-action-btn.active { background: rgba(255, 180, 0, 0.25); border-color: rgba(255, 180, 0, 0.5); }
.msg-action-btn:disabled { opacity: 0.4; cursor: default; }

/* プロンプト除外メッセージ */
.msg.excluded { opacity: 0.4; }
.msg.excluded:hover { opacity: 0.65; }

/* インライン編集 */
.msg-edit-textarea {
  width: 100%;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: var(--text);
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  margin-top: 6px;
  box-sizing: border-box;
  outline: none;
}
.msg-edit-btnrow {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.msg-edit-btnrow button {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text);
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.15s;
}
.msg-edit-btnrow button:hover { background: rgba(255, 255, 255, 0.2); }

#input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--glass-border);
  background: rgba(0,0,0,0.25);
}

#free-input {
  flex: 1;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

#free-input:focus {
  border-color: var(--accent);
}

#send-btn, #img-btn {
  background: var(--accent);
  border: none;
  color: #fff;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

#send-btn:hover { background: var(--accent-hover); }
#img-btn { background: rgba(255,255,255,0.1); }
#img-btn:hover { background: rgba(255,255,255,0.2); }

```

### webview/styles\30-status-gallery.css
```css
/* ========= ステータスエリア ========= */
#status-area {
  width: var(--status-width, 320px);
  container-type: inline-size;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

#status-header, #gallery-header, #theme-header {
  padding: 12px 20px;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--glass-border);
  background: rgba(0,0,0,0.3);
}

#status-content {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--glass-border);
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-label {
  font-size: 12px;
  color: var(--text-dim);
}

.status-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  text-align: right;
}

/* リソースバー (HP/MP) */
.resource-bar-container {
  width: 100%;
  height: 16px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  margin-top: 4px;
}

.resource-bar-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.3s ease;
}

.resource-bar-fill.hp {
  background: linear-gradient(90deg, #d32f2f, #f44336);
}
.resource-bar-fill.mp {
  background: linear-gradient(90deg, #1976d2, #2196f3);
}
.resource-bar-fill.sanity {
  background: linear-gradient(90deg, #7b1fa2, #ab47bc);
}
.resource-bar-fill.stamina {
  background: linear-gradient(90deg, #fbc02d, #ffeb3b);
}
.resource-bar-fill.shield {
  background: linear-gradient(90deg, #0097a7, #00bcd4);
}
.resource-bar-fill.generic-resource {
  background: linear-gradient(90deg, #616161, #9e9e9e);
}
.resource-bar-fill.affection {
  background: linear-gradient(90deg, #e91e63, #f48fb1);
}

.resource-text {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
  pointer-events: none;
}

/* タグリスト (スキル、インベントリ) */
.status-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255,255,255,0.08);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-item {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text);
}

/* ギャラリー */
#gallery {
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  border-bottom: 1px solid var(--glass-border);
}

#gallery:empty::after {
  content: attr(data-empty-text);
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-dim);
  font-size: 12px;
  padding: 20px;
}

.gallery-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
}

.gallery-thumb:hover {
  transform: scale(1.05);
  border-color: var(--accent);
}

/* テーマボタン */
#theme-buttons {
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.theme-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--glass-border);
  color: var(--text-dim);
  padding: 8px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.theme-btn:hover {
  background: rgba(255,255,255,0.12);
  color: var(--text);
}

.theme-btn.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: #fff;
}

/* =========================================
   レスポンシブ対応 (コンテナクエリ)
   ========================================= */
@container (max-width: 280px) {
  /* 幅が狭いときはアイコンのみにする */
  .tab-text {
    display: none;
  }
  .tab-btn {
    padding: 8px 4px;
    justify-content: center;
  }
  .tab-icon {
    font-size: 16px;
    margin: 0;
  }
  /* ステータス行も縦並びにして潰れを防ぐ */
  .status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .status-value {
    text-align: left;
  }
  #gallery {
    grid-template-columns: 1fr;
  }
}


```

### webview/styles\40-bgm-audio.css
```css
/* ========= BGM プレイヤー ========= */
#bgm-header {
  padding: 12px 20px;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--glass-border);
  background: rgba(0,0,0,0.3);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#bgm-mode {
  font-size: 9px;
  font-weight: 700;
  color: #b388ff;
  background: rgba(179, 136, 255, 0.15);
  border: 1px solid rgba(179, 136, 255, 0.35);
  border-radius: 4px;
  padding: 1px 6px;
  letter-spacing: 1px;
}

#bgm-area {
  padding: 12px 14px;
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#bgm-now {
  font-size: 13px;
  font-weight: 600;
  color: #c8a8ff;
  text-align: center;
  min-height: 18px;
  text-shadow: 0 0 14px rgba(179, 136, 255, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#bgm-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

#bgm-toggle, #bgm-mute {
  background: rgba(179, 136, 255, 0.15);
  border: 1px solid rgba(179, 136, 255, 0.35);
  color: #c8a8ff;
  width: 34px;
  height: 30px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

#bgm-toggle:hover, #bgm-mute:hover {
  background: rgba(179, 136, 255, 0.3);
}

#bgm-volume {
  flex: 1;
  min-width: 0;
  accent-color: #b388ff;
  cursor: pointer;
}

#bgm-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.bgm-item {
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--glass-border);
  color: var(--text-dim);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.bgm-item:hover {
  background: rgba(179, 136, 255, 0.18);
  color: var(--text);
}

.bgm-item.active {
  background: rgba(179, 136, 255, 0.3);
  border-color: #b388ff;
  color: #fff;
}

#bgm-empty {
  font-size: 11px;
  color: var(--text-dim);
  text-align: center;
  padding: 4px 0;
}

/* SE コントロール行 */
#sfx-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--glass-border);
}

#sfx-label {
  font-size: 11px;
  font-weight: 600;
  color: #ffc857;
  flex-shrink: 0;
}

#sfx-volume {
  flex: 1;
  min-width: 0;
  accent-color: #ffc857;
  cursor: pointer;
}

#sfx-mute {
  background: rgba(255, 200, 87, 0.15);
  border: 1px solid rgba(255, 200, 87, 0.35);
  color: #ffc857;
  width: 34px;
  height: 28px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

#sfx-mute:hover {
  background: rgba(255, 200, 87, 0.3);
}

```

### webview/styles\50-scrollbar-themes.css
```css
/* ========= スクロールバー ========= */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

/* ========= 世界観テーマ別のグラデーション背景（画像がない場合のフォールバック） ========= */
.theme-fantasy   { background: linear-gradient(135deg, #1a0a2e 0%, #16213e 50%, #0f3460 100%) !important; }
.theme-cyberpunk { background: linear-gradient(135deg, #0d0221 0%, #150050 40%, #3f0071 80%, #610094 100%) !important; }
.theme-scifi     { background: linear-gradient(135deg, #000814 0%, #001d3d 50%, #003566 100%) !important; }
.theme-ff14      { background: linear-gradient(135deg, #1b1a2e 0%, #2d1b69 50%, #11224d 100%) !important; }
.theme-postapoc  { background: linear-gradient(135deg, #1a1a0e 0%, #2d1f0e 50%, #3d2b1f 100%) !important; }
.theme-modern    { background: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%) !important; }

```

### webview/styles\60-dice-calc.css
```css
/* ========= ダイスローラー ========= */
#dice-header, #calc-header {
  padding: 12px 20px;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--glass-border);
  background: rgba(0,0,0,0.3);
}

#dice-area, #calc-area {
  padding: 12px 14px;
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ダイスのプリセットボタン群 */
#dice-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dice-btn {
  background: rgba(255, 180, 50, 0.12);
  border: 1px solid rgba(255, 180, 50, 0.35);
  color: #ffc857;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  min-width: 38px;
  text-align: center;
}

.dice-btn:hover {
  background: rgba(255, 180, 50, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(255, 180, 50, 0.2);
}

.dice-btn:active {
  transform: translateY(1px) scale(0.96);
}

/* カスタムロール行 */
#dice-custom-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

#dice-count, #dice-sides {
  width: 52px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  text-align: center;
}

#dice-custom-btn {
  background: rgba(255, 180, 50, 0.2);
  border: 1px solid rgba(255, 180, 50, 0.4);
  color: #ffc857;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

#dice-custom-btn:hover {
  background: rgba(255, 180, 50, 0.35);
}

/* 結果表示 */
#dice-result {
  font-size: 28px;
  font-weight: 700;
  color: #ffc857;
  text-align: center;
  padding: 6px 0 2px;
  text-shadow: 0 0 20px rgba(255, 200, 87, 0.5);
  letter-spacing: 1px;
  min-height: 44px;
  transition: all 0.2s;
}

#dice-send-gm {
  display: block;
  width: 100%;
  margin: 4px 0 2px;
  background: rgba(124, 179, 255, 0.15);
  border: 1px solid rgba(124, 179, 255, 0.35);
  color: #9ec5ff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

#dice-send-gm:hover:not(:disabled) {
  background: rgba(124, 179, 255, 0.28);
}

#dice-send-gm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

#dice-log {
  font-size: 11px;
  color: var(--text-dim);
  text-align: center;
  min-height: 18px;
}

/* ========= 電卓 ========= */
#calc-area {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}

#calc-input {
  flex: 1;
  min-width: 0;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--text);
  font-size: 13px;
  font-family: 'Courier New', monospace;
  outline: none;
  transition: border-color 0.2s;
}

#calc-input:focus {
  border-color: var(--accent);
}

#calc-btn {
  background: var(--accent-dim);
  border: 1px solid rgba(79, 142, 247, 0.4);
  color: #fff;
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  white-space: nowrap;
}

#calc-btn:hover {
  background: rgba(79, 142, 247, 0.5);
}

#calc-result {
  width: 100%;
  font-size: 20px;
  font-weight: 700;
  color: var(--accent-hover);
  text-align: right;
  padding: 2px 4px;
  font-family: 'Courier New', monospace;
  min-height: 30px;
}

```

### webview/styles\70-archive-stt-tts.css
```css
/* アーカイブ促しバナー（履歴が長いとき） */
.archive-suggest-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 180, 50, 0.12);
  border: 1px solid rgba(255, 180, 50, 0.35);
  font-size: 12px;
  color: #ffe8b0;
}

.archive-suggest-banner button {
  background: rgba(255, 180, 50, 0.22);
  border: 1px solid rgba(255, 180, 50, 0.45);
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.archive-suggest-banner button:hover {
  background: rgba(255, 180, 50, 0.35);
}

#archive-suggest-dismiss {
  margin-left: auto;
  padding: 2px 8px;
  font-size: 14px;
  line-height: 1;
}

#calc-history {
  width: 100%;
  font-size: 11px;
  color: var(--text-dim);
  font-family: 'Courier New', monospace;
  line-height: 1.6;
  max-height: 60px;
  overflow-y: auto;
  text-align: right;
}

/* 音声入力 (STT) マイクボタン */
#mic-btn {
  font-size: 14px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text);
  transition: all 0.15s;
  flex-shrink: 0;
}

#mic-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: var(--accent);
}

#mic-btn.listening {
  background: rgba(220, 60, 60, 0.35);
  border-color: #e05050;
  color: #fff;
  animation: mic-pulse 1.2s ease-in-out infinite;
}

@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 60, 60, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(220, 60, 60, 0); }
}

/* AI音声ナレーション (TTS) コントロール */
#tts-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 8px;
}

#tts-toggle-btn {
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text);
  transition: all 0.15s;
}

#tts-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: var(--accent);
}

#tts-toggle-btn.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: #fff;
  box-shadow: 0 0 8px rgba(80, 160, 255, 0.35);
}

.tts-menu-popup {
  position: absolute;
  top: 34px;
  right: 0;
  width: 250px;
  background: rgba(15, 15, 25, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tts-menu-popup.hidden {
  display: none;
}

.tts-menu-popup h4 {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-hover);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 6px;
  margin: 0;
}

.tts-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
}

.tts-menu-row label {
  color: var(--text-dim);
  flex-shrink: 0;
}

.tts-menu-row input[type="range"] {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  accent-color: var(--accent);
}

.tts-menu-row input[type="checkbox"] {
  accent-color: var(--accent);
  cursor: pointer;
}

.tts-menu-row span {
  font-family: monospace;
  width: 38px;
  text-align: right;
  color: var(--text-dim);
}

```

### webview/styles\80-image-gen.css
```css
/* ========= 画像プロンプト再生成UI ========= */
.scene-img-container {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.image-prompt-editor {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.image-prompt-editor .prompt-label {
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 600;
}

.image-prompt-editor .prompt-textarea {
  width: 100%;
  min-height: 40px;
  max-height: 120px;
  resize: vertical;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.4;
  font-family: inherit;
}

.image-prompt-editor .prompt-textarea:focus {
  outline: none;
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.1);
}

.regen-img-btn, .manual-gen-btn {
  align-self: flex-end;
  background: rgba(179, 136, 255, 0.15);
  border: 1px solid rgba(179, 136, 255, 0.4);
  color: #dcb3ff;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.regen-img-btn:hover, .manual-gen-btn:hover {
  background: rgba(179, 136, 255, 0.3);
  transform: translateY(-1px);
}

.manual-gen-btn {
  margin-top: 8px;
}

/* ========= Image Gen Settings パネル ========= */
#img-gen-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.img-gen-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  backdrop-filter: blur(2px);
}

.img-gen-backdrop.hidden {
  display: none;
}

.img-gen-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: min(360px, 92vw);
  height: 100vh;
  background: rgba(30, 30, 40, 0.78);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-left: 1px solid var(--glass-border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5);
  z-index: 201;
  display: flex;
  flex-direction: column;
  transform: translateX(0);
  transition: transform 0.25s ease;
}

.img-gen-panel.hidden {
  display: none;
}

.img-gen-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--glass-border);
}

.img-gen-panel-header h3 {
  margin: 0;
  font-size: 14px;
  color: var(--accent-hover);
}

.img-gen-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.img-gen-hint {
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.45;
  margin-bottom: 4px;
}

.img-gen-panel-body label {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 4px;
}

.img-gen-input,
.img-gen-textarea {
  width: 100%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  color: var(--text);
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
}

.img-gen-textarea {
  resize: vertical;
  min-height: 48px;
}

.img-gen-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.img-gen-templates summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--accent);
  margin: 8px 0 4px;
}

.img-gen-saved {
  font-size: 11px;
  color: #7dcea0;
  text-align: right;
  margin-top: 6px;
}

.img-gen-saved.hidden {
  display: none;
}

```

### webview/styles\90-game-rules.css
```css
/* 90-game-rules.css */
/* Reuses .img-gen-panel and .img-gen-input from 80-image-gen.css */

#game-rules-wrap {
    margin-right: 0.5rem;
}

```

### webview/styles\90-inspector.css
```css
.inspector-section {
    margin-bottom: 16px;
}

.inspector-section h4 {
    margin: 0 0 8px 0;
    color: var(--text-color);
    font-size: 13px;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 4px;
}

.inspector-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.inspector-item {
    padding: 6px 8px;
    background: var(--bg-hover);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, Consolas, monospace);
}

.lorebook-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
}

.lorebook-dirty {
    font-size: 11px;
    color: var(--text-warning, #c9a227);
}

.lorebook-dirty.hidden {
    display: none;
}

.lorebook-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}

.lorebook-form label {
    display: block;
    font-size: 11px;
    margin-top: 6px;
    color: var(--text-muted, #888);
}

.lorebook-form input[type="text"],
.lorebook-form textarea {
    width: 100%;
    box-sizing: border-box;
    margin-top: 2px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, Consolas, monospace);
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    padding: 4px 6px;
}

.lorebook-form-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
    font-size: 11px;
}

.small-btn {
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    border: 1px solid var(--vscode-button-border, #555);
    border-radius: 3px;
    background: var(--vscode-button-secondaryBackground, #3c3c3c);
    color: var(--vscode-button-secondaryForeground, #ccc);
}

.small-btn.primary {
    font-weight: 600;
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
}

.memory-toolbar,
.memory-search-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
}

.memory-search-row input[type="text"] {
    flex: 1;
    min-width: 120px;
    font-size: 12px;
    padding: 4px 6px;
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #ccc);
}

.memory-search-results {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.lorebook-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
}

.lorebook-card-head {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
}

.lorebook-preview {
    margin-top: 4px;
    color: var(--text-muted, #888);
    font-size: 11px;
    white-space: pre-wrap;
}

.prompt-preview {
    margin: 6px 0 0;
    white-space: pre-wrap;
    font-size: 11px;
    max-height: 200px;
    overflow: auto;
}

.diff-item {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.patch-value {
    color: var(--text-color);
    font-weight: bold;
}

.party-global-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 12px;
}

.party-flag-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
}

.party-members-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
    max-height: 420px;
    overflow-y: auto;
}

.party-member-card {
    padding: 10px;
    background: var(--bg-hover);
    border-radius: 6px;
    border: 1px solid var(--border-color);
}

.party-member-card h5 {
    margin: 0 0 8px 0;
    font-size: 13px;
}

.party-control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    margin-bottom: 6px;
}

.party-control-row input[type="range"] {
    flex: 1;
}

.party-verb-val {
    min-width: 28px;
    text-align: right;
    font-family: var(--vscode-editor-font-family, Consolas, monospace);
}

.party-flags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 6px;
}

.party-rel-title {
    font-size: 11px;
    color: var(--text-muted, #888);
    margin-top: 6px;
}

.party-rel-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
    margin-top: 4px;
}

.party-rel-row select {
    font-size: 11px;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    padding: 2px 4px;
}

.remote-play-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1200;
    width: min(92vw, 520px);
    max-height: 90vh;
    overflow-y: auto;
    background: var(--glass-bg, rgba(30, 30, 40, 0.95));
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}

.remote-play-panel.hidden {
    display: none;
}

.remote-play-body {
    padding: 12px 16px 16px;
}

.remote-play-qr-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    justify-content: center;
}

.remote-play-qr-block {
    text-align: center;
    flex: 1;
    min-width: 180px;
}

.remote-play-qr-block h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
}

.remote-play-qr {
    display: block;
    margin: 0 auto 8px;
    border-radius: 8px;
    background: #fff;
}

.remote-play-url {
    font-size: 10px;
    word-break: break-all;
    color: var(--text-muted, #888);
    margin: 0 0 8px 0;
    font-family: var(--vscode-editor-font-family, Consolas, monospace);
}

.remote-play-clients-wrap {
    margin-top: 12px;
}

.remote-play-clients-wrap h4 {
    margin: 0 0 6px 0;
    font-size: 12px;
}

.remote-play-clients {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
}

.remote-client-row {
    font-size: 11px;
    padding: 4px 8px;
    background: var(--bg-hover);
    border-radius: 4px;
    font-family: var(--vscode-editor-font-family, Consolas, monospace);
}

```

### webview/modules\00-core.js
```javascript
// @ts-nocheck
// LoreRelay - Webview Script
// Handles UI interactions and postMessage communication with extension host

const vscode = acquireVsCodeApi();

// ===== i18n =====
let i18nStrings = {};
let currentLocale = 'en';
let welcomeShown = false;

function T(key, vars) {
  let text = i18nStrings[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

function applyI18n() {
  document.documentElement.lang = currentLocale;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = T(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = T(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = T(el.dataset.i18nTitle);
  });
  const gallery = document.getElementById('gallery');
  if (gallery) {
    gallery.dataset.emptyText = T('webview.gallery.empty');
  }
  const bgmMode = document.getElementById('bgm-mode');
  if (bgmMode) {
    bgmMode.textContent = T('webview.bgm.auto');
    bgmMode.title = T('webview.bgm.autoTitle');
  }
}

const localeSelect = () => document.getElementById('locale-select');

// DOM Elements
const chatLog = document.getElementById('chat-log');
const optionsBar = document.getElementById('options-bar');
const freeInput = document.getElementById('free-input');
const sendBtn = document.getElementById('send-btn');
const imgBtn = document.getElementById('img-btn');
const bgLayer = document.getElementById('bg-layer');
const spriteLayer = document.getElementById('sprite-layer');

// State
let currentTheme = 'fantasy';
let messageHistory = [];
let galleryImages = [];
let lastDiceRequestId = null;
let seenHiddenDiceIds = new Set();
let ttsEnabled = false;
let ttsSpeed = 1.0;
let ttsVolume = 0.8;
let gameOverActive = false;
let rewindTargets = [];
let checkpointMetas = [];

```

### webview/modules\10-game-state.js
```javascript
// ===== Game State の適用 =====
function applyEntryPatch(patch) {
  if (!patch?.id) return;
  const idx = messageHistory.findIndex(m => m.id === patch.id);
  if (idx < 0) return;
  const prev = messageHistory[idx];
  const next = { ...prev, ...patch };
  messageHistory[idx] = next;
  const el = document.getElementById(`msg-${patch.id}`);
  if (el) {
    el.remove();
    renderMessage(next);
  }
  if (next.image) {
    addImageToGallery(next.image);
  }
  saveState();
}

function applyGameState(state, fullHistory) {
  if (!state) return;

  // ログエントリの追加
  if (state.entries && Array.isArray(state.entries)) {
    if (fullHistory) {
      // パネル再表示時: 全履歴を新しい WebviewURI で置き換え
      messageHistory = [];
      chatLog.innerHTML = '';
      seenHiddenDiceIds.clear();
    }
    const existingIds = new Set(messageHistory.map(m => m.id));
    let lastAddedEntry = null;
    for (const entry of state.entries) {
      if (!existingIds.has(entry.id)) {
        messageHistory.push(entry);
        renderMessage(entry);
        if (entry.role === 'gm') {
          lastAddedEntry = entry;
        }
      } else {
        const idx = messageHistory.findIndex(m => m.id === entry.id);
        if (idx >= 0) {
          const prev = messageHistory[idx];
          const imageChanged = entry.image && entry.image !== prev.image;
          const promptChanged = entry.imagePrompt !== undefined && entry.imagePrompt !== prev.imagePrompt;
          if (imageChanged || promptChanged) {
            applyEntryPatch({
              id: entry.id,
              ...(imageChanged ? { image: entry.image } : {}),
              ...(promptChanged ? { imagePrompt: entry.imagePrompt } : {})
            });
          }
        }
      }
    }
    if (lastAddedEntry && !fullHistory) {
      speakText(lastAddedEntry.content);
    }
  }

  // ステータスの更新
  updateStatus(state.status);

  // 選択肢の更新
  if (state.options && Array.isArray(state.options)) {
    renderOptions(state.options);
  }

  // 画像の更新
  if (state.latestImage) {
    addImageToGallery(state.latestImage);
  }

  // テーマの更新
  if (state.theme) {
    setTheme(state.theme);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.theme-btn[data-theme="${state.theme}"]`);
    if (btn) btn.classList.add('active');
  }

  // Summary
  if (state.summary !== undefined) {
    document.getElementById('story-summary').value = state.summary;
  }

  if (state.background) {
    setSceneBackground(state.background);
  }

  if (state.sprite) {
    setSceneSprite(state.sprite);
  }

  if (state.gameOver) {
    setGameOverOverlay(state.gameOver);
  } else {
    setGameOverOverlay({ active: false });
  }

  // BGM の更新（GM が bgm=トラックID か mood=ムード名を指定）
  if (state.bgm) {
    playBgmById(state.bgm);
  } else if (state.mood) {
    playBgmByMood(state.mood);
  }

  // 効果音(SE)の再生（GM が sfx=ID または [ID,...] を指定）
  if (state.sfx) {
    const ids = Array.isArray(state.sfx) ? state.sfx : [state.sfx];
    ids.forEach(id => playSfx(id));
  }

  // 隠しダイス通知（GM が hiddenDice に振ったダイスを記録）
  if (Array.isArray(state.hiddenDice)) {
    state.hiddenDice.forEach(entry => {
      const entryId = entry.id || `hd-${entry.notation}-${entry.purpose || ''}`;
      if (!seenHiddenDiceIds.has(entryId)) {
        seenHiddenDiceIds.add(entryId);
        const label = entry.notation || '?d?';
        const purposeText = entry.purpose ? `（${entry.purpose}）` : '';
        addSystemMessage(T('webview.dice.hiddenRoll', { notation: label }) + purposeText);
        playSfx('dice');
      }
    });
  }

  // GM からのダイス要求（diceRequest）→ 自動ロール + 音で成否確認
  if (state.diceRequest) {
    const req = state.diceRequest;
    const reqId = req.id || `${req.notation}|${req.purpose || ''}`;
    if (reqId !== lastDiceRequestId) {
      lastDiceRequestId = reqId;
      handleDiceRequest(req);
    }
  }

  // 状態を保存
  saveState();

  // 自動スクロール
  scrollToBottom();
}

// ===== メッセージ描画 =====
function renderMessage(entry) {
  const div = document.createElement('div');
  div.className = `msg ${entry.role || 'gm'}`;
  if (entry.excludedFromPrompt) { div.classList.add('excluded'); }
  div.id = `msg-${entry.id}`;

  // キャラ名の色分け
  const senderColor = getCharacterColor(entry.sender || (entry.role === 'user' ? 'Player' : 'Game Master'));

  const defaultSender = entry.role === 'user' ? T('webview.sender.player') : T('webview.sender.gm');
  let html = `<div class="msg-sender" style="color: ${senderColor}">${escapeHtml(entry.sender || defaultSender)}</div>`;

  let bodyHtml = escapeHtml(entry.content);
  if (bodyHtml.includes('```mermaid')) {
    bodyHtml = bodyHtml.replace(/```mermaid\n([\s\S]*?)```/g, (match, p1) => {
      // Unescape since mermaid needs raw characters, but we just escaped them
      const raw = p1
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      return `<div class="mermaid">${raw}</div>`;
    });
    // Trigger mermaid run after DOM update
    setTimeout(() => {
      if (window.mermaid) {
        window.mermaid.run({ querySelector: '.mermaid' }).catch(e => console.error('Mermaid render error:', e));
      }
    }, 100);
  }

  html += `<div class="msg-body">${bodyHtml}</div>`;

  div.innerHTML = html;

  // ===== メッセージアクションバー =====
  if (entry.role !== 'system') {
    const actionsBar = document.createElement('div');
    actionsBar.className = 'msg-actions';

    // 📄 コピー
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.title = T('webview.msg.copy') || 'Copy';
    copyBtn.textContent = '📄';
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(entry.content).catch(() => {});
      copyBtn.textContent = '✅';
      setTimeout(() => { copyBtn.textContent = '📄'; }, 1200);
    };
    actionsBar.appendChild(copyBtn);

    // 📢 読み上げ (TTS)
    const speakBtn = document.createElement('button');
    speakBtn.className = 'msg-action-btn';
    speakBtn.title = T('webview.msg.speak') || 'Speak';
    speakBtn.textContent = '📢';
    speakBtn.onclick = () => speakText(entry.content);
    actionsBar.appendChild(speakBtn);

    // 🎨 画像生成
    const genImgBtn = document.createElement('button');
    genImgBtn.className = 'msg-action-btn';
    genImgBtn.title = T('webview.msg.genImage') || 'Generate Image';
    genImgBtn.textContent = '🎨';
    genImgBtn.onclick = () => {
      vscode.postMessage({
        type: 'generateImage',
        prompt: entry.imagePrompt || entry.content.substring(0, 300),
        mode: 'illustrious',
        entryId: entry.id
      });
      addSystemMessage(T('webview.image.requested'));
    };
    actionsBar.appendChild(genImgBtn);

    // 🚩 チェックポイント
    const cpBtn = document.createElement('button');
    cpBtn.className = 'msg-action-btn';
    cpBtn.title = T('webview.msg.checkpoint') || 'Save Checkpoint';
    cpBtn.textContent = '🚩';
    cpBtn.onclick = () => vscode.postMessage({ type: 'saveCheckpoint', label: `Turn-${entry.id}` });
    actionsBar.appendChild(cpBtn);

    // 👁️ プロンプト除外トグル
    const excludeBtn = document.createElement('button');
    excludeBtn.className = 'msg-action-btn' + (entry.excludedFromPrompt ? ' active' : '');
    excludeBtn.dataset.action = 'exclude';
    excludeBtn.title = T('webview.msg.exclude') || 'Toggle prompt exclusion';
    excludeBtn.textContent = '👁️';
    excludeBtn.onclick = () => vscode.postMessage({ type: 'toggleExcludeEntry', id: entry.id });
    actionsBar.appendChild(excludeBtn);

    // 🔱 巻き戻し（このターンまで戻る・簡易版）
    const branchBtn = document.createElement('button');
    branchBtn.className = 'msg-action-btn';
    branchBtn.title = T('webview.msg.rewind') || 'Rewind to this turn';
    branchBtn.textContent = '🔱';
    branchBtn.onclick = () => {
      if (confirm(T('webview.msg.rewindConfirm') || 'Rewind history to this turn? (Future turns will be lost)')) {
        vscode.postMessage({ type: 'branchFromEntry', entryId: entry.id });
      }
    };
    actionsBar.appendChild(branchBtn);

    // ⎇ Gitブランチ（このターンから別世界線を作る）
    const gitBranchBtn = document.createElement('button');
    gitBranchBtn.className = 'msg-action-btn';
    gitBranchBtn.title = T('webview.msg.gitBranch') || 'Create alternate timeline (Git Branch) from this turn';
    gitBranchBtn.textContent = '⎇';
    gitBranchBtn.onclick = () => {
      if (confirm(T('webview.msg.gitBranchConfirm') || 'Create a new alternate timeline branch from this turn?')) {
        vscode.postMessage({ type: 'branchTimeline', turnId: entry.id });
      }
    };
    actionsBar.appendChild(gitBranchBtn);

    // ✏️ 編集
    const editBtn = document.createElement('button');
    editBtn.className = 'msg-action-btn';
    editBtn.title = T('webview.msg.edit') || 'Edit';
    editBtn.textContent = '✏️';
    editBtn.onclick = () => startInlineEdit(div, entry, editBtn);
    actionsBar.appendChild(editBtn);

    div.appendChild(actionsBar);
  }

  // 画像があれば表示 (セキュリティのためcreateElementを使用)
  if (entry.image) {
    const imgContainer = document.createElement('div');
    imgContainer.className = 'scene-img-container';
    
    const imgEl = document.createElement('img');
    imgEl.className = 'scene-img';
    imgEl.src = entry.image;
    imgEl.alt = 'Scene';
    imgEl.dataset.msgId = entry.id;
    imgContainer.appendChild(imgEl);

    // プロンプト編集・再生成UI
    const promptEditor = document.createElement('div');
    promptEditor.className = 'image-prompt-editor';

    const label = document.createElement('div');
    label.className = 'prompt-label';
    label.textContent = T('webview.image.promptLabel');
    promptEditor.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'prompt-textarea';
    textarea.placeholder = T('webview.image.promptPlaceholder');
    textarea.value = entry.imagePrompt || '';
    promptEditor.appendChild(textarea);

    const regenBtn = document.createElement('button');
    regenBtn.className = 'regen-img-btn';
    regenBtn.innerHTML = `🔄 ${T('webview.image.regenerateBtn')}`;
    regenBtn.onclick = () => {
      vscode.postMessage({
        type: 'generateImage',
        prompt: textarea.value.trim(),
        mode: 'illustrious', // TODO: 汎用化できるならする
        entryId: entry.id
      });
      addSystemMessage(T('webview.image.requested') || 'Requested image generation...');
    };
    promptEditor.appendChild(regenBtn);
    imgContainer.appendChild(promptEditor);

    div.appendChild(imgContainer);
  } else if (entry.imageBlocked) {
    const ph = document.createElement('div');
    ph.className = 'scene-img-placeholder';
    ph.textContent = T('webview.image.blocked');
    div.appendChild(ph);
  } else if (entry.role === 'gm') {
    // 画像がないGMターンでの手動生成ボタン
    const manualGenBtn = document.createElement('button');
    manualGenBtn.className = 'manual-gen-btn glass-btn';
    manualGenBtn.textContent = T('webview.image.manualGenBtn');
    manualGenBtn.onclick = () => {
      vscode.postMessage({
        type: 'generateImage',
        prompt: entry.imagePrompt || entry.content.substring(0, 300),
        mode: 'illustrious',
        entryId: entry.id
      });
      addSystemMessage(T('webview.image.requested') || 'Requested image generation...');
    };
    div.appendChild(manualGenBtn);
  }

  chatLog.appendChild(div);
}

function renderAllMessages() {
  chatLog.innerHTML = '';
  for (const m of messageHistory) {
    renderMessage(m);
  }
}

function addSystemMessage(text) {
  const entry = { id: `sys-${Date.now()}`, role: 'system', content: text, sender: T('webview.sender.system') };
  messageHistory.push(entry);
  renderMessage(entry);
  saveState();
}

// ===== ステータス更新 =====
function updateStatus(status) {
  const statusContent = document.getElementById('status-content');
  if (!status) {
    if (statusContent) statusContent.style.display = 'none';
    return;
  }
  if (statusContent) statusContent.style.display = '';

  // Location
  const locRow = document.getElementById('status-row-location');
  if (status.location) {
    document.getElementById('status-location').textContent = status.location;
    if (locRow) locRow.style.display = '';
  } else {
    if (locRow) locRow.style.display = 'none';
  }

  // Time
  const timeRow = document.getElementById('status-row-time');
  if (status.time) {
    document.getElementById('status-time').textContent = status.time;
    if (timeRow) timeRow.style.display = '';
  } else {
    if (timeRow) timeRow.style.display = 'none';
  }

  // Funds
  const fundsRow = document.getElementById('status-row-funds');
  if (status.funds) {
    document.getElementById('status-funds').textContent = status.funds;
    if (fundsRow) fundsRow.style.display = '';
  } else {
    if (fundsRow) fundsRow.style.display = 'none';
  }

  // Dynamic Resources (HP, MP, Sanity, Shields, etc.)
  const dynamicContainer = document.getElementById('dynamic-resources-container');
  if (dynamicContainer) {
    dynamicContainer.innerHTML = '';
    
    // Default icons/colors mapping
    const resourceMeta = {
      hp: { icon: '❤️', label: 'HP', class: 'hp' },
      mp: { icon: '🔷', label: 'MP', class: 'mp' },
      sanity: { icon: '🧠', label: 'Sanity', class: 'sanity' },
      stamina: { icon: '⚡', label: 'Stamina', class: 'stamina' },
      shield: { icon: '🛡️', label: 'Shield', class: 'shield' }
    };

    let renderedCount = 0;
    for (const [key, value] of Object.entries(status)) {
      if (value && typeof value === 'object' && 'current' in value && 'max' in value) {
        // キー名のバリデーション（安全な英数字のみ）
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
          console.warn(`[game-state] Ignored dynamic resource with suspicious key: ${key}`);
          continue;
        }

        // 描画上限チェック
        if (++renderedCount > 10) {
          console.warn(`[game-state] Dynamic resource count exceeded limit (max 10). Omitted: ${key}`);
          break;
        }

        const current = Number(value.current) || 0;
        const max = Number(value.max) || 1;
        const pct = Math.max(0, Math.min(100, (current / max) * 100));
        
        const meta = resourceMeta[key.toLowerCase()] || { 
          icon: '📊', 
          label: key.toUpperCase(), 
          class: 'generic-resource' 
        };

        const block = document.createElement('div');
        block.className = 'status-block';
        block.id = `status-block-${key}`;
        
        block.innerHTML = `
          <div class="status-row">
            <span class="status-label">${meta.icon} ${escapeHtml(meta.label)}</span>
          </div>
          <div class="resource-bar-container">
            <div id="status-${key}-bar" class="resource-bar-fill ${meta.class}" style="width: ${pct}%;"></div>
            <div id="status-${key}-text" class="resource-text">${current} / ${max}</div>
          </div>
        `;
        dynamicContainer.appendChild(block);
        
      } else if (typeof value === 'number' && key !== 'funds') {
        // affection や reputation のような単一の数値 (0-100を想定) の場合
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue;
        if (++renderedCount > 15) break;

        const current = Math.max(0, Math.min(100, Number(value)));
        const meta = resourceMeta[key.toLowerCase()] || { 
          icon: '💖', 
          label: key.charAt(0).toUpperCase() + key.slice(1), 
          class: 'affection' 
        };

        const block = document.createElement('div');
        block.className = 'status-block';
        block.id = `status-block-${key}`;
        
        block.innerHTML = `
          <div class="status-row">
            <span class="status-label">${meta.icon} ${escapeHtml(meta.label)}</span>
          </div>
          <div class="resource-bar-container">
            <div id="status-${key}-bar" class="resource-bar-fill ${meta.class}" style="width: ${current}%;"></div>
            <div id="status-${key}-text" class="resource-text">${current} / 100</div>
          </div>
        `;
        dynamicContainer.appendChild(block);
      }
    }
  }

  // リスト（タグ）の更新ヘルパー
  const renderList = (elementId, items) => {
    const container = document.getElementById(elementId);
    container.innerHTML = '';
    if (!items || !Array.isArray(items) || items.length === 0) {
      container.innerHTML = `<span class="tag-item empty-tag" style="color:var(--text-dim);">${escapeHtml(T('webview.empty'))}</span>`;
      return;
    }
    items.forEach(item => {
      const span = document.createElement('span');
      span.className = 'tag-item';
      span.textContent = item;
      container.appendChild(span);
    });
  };

  // 後方互換: 旧形式の文字列 condition も配列として扱う
  const condBlock = document.getElementById('status-block-condition');
  if (status.hasOwnProperty('condition') && status.condition !== null && status.condition !== undefined) {
    const conditions = Array.isArray(status.condition)
      ? status.condition
      : (status.condition ? [String(status.condition)] : []);
    renderList('status-condition-list', conditions);
    if (condBlock) condBlock.style.display = '';
  } else {
    if (condBlock) condBlock.style.display = 'none';
  }

  // Inventory
  const invBlock = document.getElementById('status-block-inventory');
  if (status.inventory && Array.isArray(status.inventory)) {
    renderList('status-inventory-list', status.inventory);
    if (invBlock) invBlock.style.display = '';
  } else {
    if (invBlock) invBlock.style.display = 'none';
  }

  // Skills
  const skillBlock = document.getElementById('status-block-skills');
  if (status.skills && Array.isArray(status.skills)) {
    renderList('status-skills-list', status.skills);
    if (skillBlock) skillBlock.style.display = '';
  } else {
    if (skillBlock) skillBlock.style.display = 'none';
  }
}

function isInputLocked() {
  return gameOverActive;
}

function setInputLocked(locked) {
  const els = [freeInput, sendBtn, imgBtn, micBtn, undoBtn, document.getElementById('regen-btn')];
  els.forEach((el) => { if (el) el.disabled = locked; });
  document.querySelectorAll('.option-btn').forEach((btn) => { btn.disabled = locked; });
  document.querySelectorAll('.qr-btn').forEach((btn) => { btn.disabled = locked; });
}

function setGameOverOverlay(gameOver) {
  const overlay = document.getElementById('game-over-overlay');
  const titleEl = document.getElementById('game-over-title');
  const msgEl = document.getElementById('game-over-message');
  if (!overlay || !titleEl || !msgEl) return;
  gameOverActive = !!(gameOver && gameOver.active);
  if (!gameOverActive) {
    overlay.classList.add('hidden');
    setInputLocked(false);
    return;
  }
  const victory = !!gameOver.victory;
  titleEl.textContent = victory ? T('webview.gameOver.victory') : T('webview.gameOver.defeat');
  msgEl.textContent = gameOver.message || titleEl.textContent;
  const card = overlay.querySelector('.game-over-card');
  if (card) {
    card.classList.toggle('victory', victory);
    card.classList.toggle('defeat', !victory);
  }
  overlay.classList.remove('hidden');
  setInputLocked(true);
  window.speechSynthesis?.cancel();
}

// ===== 選択肢ボタン =====
function renderOptions(options) {
  optionsBar.innerHTML = '';
  if (isInputLocked()) return;
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = `${i + 1}. ${opt}`;
    btn.addEventListener('click', () => {
      if (isInputLocked()) return;
      window.speechSynthesis?.cancel();
      vscode.postMessage({
        type: 'selectOption',
        text: `${i + 1}. ${opt}`,
        authorsNote: getAuthorsNote()
      });
      clearAuthorsNote();
      // UIにもPlayerメッセージとして追加
      const entry = { id: `user-${Date.now()}`, role: 'user', content: `${i + 1}. ${opt}`, sender: T('webview.sender.player') };
      messageHistory.push(entry);
      renderMessage(entry);
      optionsBar.innerHTML = '';
      scrollToBottom();
      saveState();
    });
    optionsBar.appendChild(btn);
  });
}

// ===== ギャラリー =====
function addImageToGallery(imagePath) {
  if (galleryImages.includes(imagePath)) return;
  galleryImages.push(imagePath);
  renderGallery();
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  for (const img of galleryImages) {
    const thumb = document.createElement('img');
    thumb.className = 'gallery-thumb';
    thumb.src = img;
    thumb.addEventListener('click', () => {
      // 画像に紐づくメッセージへスクロール
      const msgWithImg = messageHistory.find(m => m.image === img);
      if (msgWithImg) {
        const el = document.getElementById(`msg-${msgWithImg.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    gallery.appendChild(thumb);
  }
}

// ===== テーマ切り替え =====
function setSceneBackground(uri) {
  if (!bgLayer || !uri) return;
  bgLayer.style.backgroundImage = `url("${uri}")`;
  bgLayer.className = 'has-scene-bg';
}

function setSceneSprite(sprite) {
  if (!spriteLayer) return;
  spriteLayer.classList.remove('visible', 'pos-left', 'pos-right', 'pos-center');
  spriteLayer.innerHTML = '';
  
  let imgPath = '';
  if (typeof sprite === 'string') {
    imgPath = sprite;
  } else if (sprite && sprite.name) {
    const char = window.currentCharacters?.find(c => c.name === sprite.name);
    if (char) {
      if (sprite.expression && char.expressions && char.expressions[sprite.expression]) {
        imgPath = char.expressions[sprite.expression];
      } else {
        imgPath = char.portrait || sprite.image || '';
      }
    } else {
      imgPath = sprite.image || '';
    }
  } else {
    imgPath = sprite?.image || '';
  }

  if (!imgPath) return;
  const img = document.createElement('img');
  img.src = imgPath;
  img.alt = (typeof sprite === 'object' && sprite?.name) ? sprite.name : 'Character';
  spriteLayer.appendChild(img);
  const pos = (typeof sprite === 'object' && sprite?.position) ? sprite.position : 'center';
  if (pos === 'left') spriteLayer.classList.add('pos-left');
  else if (pos === 'right') spriteLayer.classList.add('pos-right');
  else spriteLayer.classList.add('pos-center');
  spriteLayer.classList.add('visible');
}

function setTheme(theme) {
  currentTheme = theme;
  if (!bgLayer.style.backgroundImage) {
    bgLayer.className = `theme-${theme}`;
  }
  // ボタンのアクティブ状態を更新
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  saveState();
}

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => setTheme(btn.dataset.theme));
});

```

### webview/modules\20-input-audio-prep.js
```javascript
// ===== 自由入力 =====
sendBtn.addEventListener('click', sendFreeInput);
freeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendFreeInput();
});

const undoBtn = document.getElementById('undo-btn');
if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    window.speechSynthesis?.cancel();
    vscode.postMessage({ type: 'undoLastTurn' });
  });
}

const regenBtn = document.getElementById('regen-btn');
if (regenBtn) {
  regenBtn.addEventListener('click', () => {
    if (isInputLocked()) return;
    window.speechSynthesis?.cancel();
    vscode.postMessage({ type: 'regenerateLastTurn' });
  });
}

const checkpointSaveBtn = document.getElementById('checkpoint-save-btn');
if (checkpointSaveBtn) {
  checkpointSaveBtn.addEventListener('click', () => {
    const label = prompt(T('webview.checkpoint.savePrompt'), '');
    vscode.postMessage({ type: 'saveCheckpoint', label: label || '' });
  });
}

const rewindBtn = document.getElementById('rewind-btn');
const rewindSelect = document.getElementById('rewind-select');
if (rewindBtn && rewindSelect) {
  rewindBtn.addEventListener('click', () => {
    const entryId = rewindSelect.value;
    if (!entryId) return;
    window.speechSynthesis?.cancel();
    vscode.postMessage({ type: 'restoreToTurn', entryId });
  });
}

function renderCheckpointUi() {
  const list = document.getElementById('checkpoint-list');
  const empty = document.getElementById('checkpoint-empty');
  const select = document.getElementById('rewind-select');
  if (!list || !empty || !select) return;

  list.innerHTML = '';
  if (checkpointMetas.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    for (const cp of checkpointMetas) {
      const li = document.createElement('li');
      li.className = 'checkpoint-item';
      const label = document.createElement('span');
      label.className = 'checkpoint-label';
      label.textContent = `${cp.label} — ${cp.turnLabel}`;
      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = T('webview.checkpoint.restore');
      restoreBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'restoreCheckpoint', checkpointId: cp.id });
      });
      const delBtn = document.createElement('button');
      delBtn.textContent = T('webview.checkpoint.delete');
      delBtn.className = 'checkpoint-delete';
      delBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'deleteCheckpoint', checkpointId: cp.id });
      });
      li.appendChild(label);
      li.appendChild(restoreBtn);
      li.appendChild(delBtn);
      list.appendChild(li);
    }
  }

  const current = select.value;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = T('webview.checkpoint.rewind');
  select.appendChild(placeholder);
  for (const t of rewindTargets) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.label;
    select.appendChild(opt);
  }
  if (current && [...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

// ===== 音声入力 (STT) — DREAMIO 参考 =====
const micBtn = document.getElementById('mic-btn');
let speechRecognition = null;
let isListening = false;

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getSttLocale() {
  const map = {
    ja: 'ja-JP',
    en: 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW'
  };
  return map[currentLocale] || 'en-US';
}

function stopListening() {
  if (speechRecognition && isListening) {
    try { speechRecognition.stop(); } catch { /* ignore */ }
  }
  isListening = false;
  if (micBtn) {
    micBtn.classList.remove('listening');
    micBtn.title = T('webview.stt.title');
  }
}

function startListening() {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    addSystemMessage(T('webview.stt.unsupported'));
    return;
  }
  if (isListening) {
    stopListening();
    return;
  }

  window.speechSynthesis?.cancel();
  speechRecognition = new Ctor();
  speechRecognition.lang = getSttLocale();
  speechRecognition.interimResults = true;
  speechRecognition.continuous = false;
  speechRecognition.maxAlternatives = 1;

  speechRecognition.onstart = () => {
    isListening = true;
    if (micBtn) {
      micBtn.classList.add('listening');
      micBtn.title = T('webview.stt.listening');
    }
    if (freeInput) {
      freeInput.placeholder = T('webview.stt.listening');
    }
  };

  speechRecognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (freeInput) {
      freeInput.value = transcript.trim();
    }
    const last = event.results[event.results.length - 1];
    if (last?.isFinal && transcript.trim()) {
      stopListening();
      sendFreeInput();
    }
  };

  speechRecognition.onerror = (event) => {
    stopListening();
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      addSystemMessage(`${T('webview.stt.error')}: ${event.error}`);
    }
  };

  speechRecognition.onend = () => {
    isListening = false;
    if (micBtn) {
      micBtn.classList.remove('listening');
      micBtn.title = T('webview.stt.title');
    }
    if (freeInput) {
      freeInput.placeholder = T('webview.input.placeholder');
    }
  };

  try {
    speechRecognition.start();
  } catch {
    stopListening();
    addSystemMessage(T('webview.stt.unsupported'));
  }
}

if (micBtn) {
  micBtn.addEventListener('click', startListening);
}

function getAuthorsNote() {
  const el = document.getElementById('authors-note-input');
  return el ? el.value.trim() : '';
}

function clearAuthorsNote() {
  const el = document.getElementById('authors-note-input');
  if (el) el.value = '';
}

function sendFreeInput() {
  if (isInputLocked()) return;
  stopListening();
  const text = freeInput.value.trim();
  if (!text) return;
  window.speechSynthesis?.cancel();
  vscode.postMessage({ type: 'freeInput', text, authorsNote: getAuthorsNote() });
  clearAuthorsNote();
  const entry = { id: `user-${Date.now()}`, role: 'user', content: text, sender: T('webview.sender.player') };
  messageHistory.push(entry);
  renderMessage(entry);
  freeInput.value = '';
  scrollToBottom();
  saveState();
}

// ===== 画像生成ボタン =====
imgBtn.addEventListener('click', () => {
  const lastGmEntry = [...messageHistory].reverse().find(m => m && m.role === 'gm' && m.id);
  if (!lastGmEntry) {
    addSystemMessage(T('webview.image.noTurn'));
    return;
  }
  const promptSource = lastGmEntry.imagePrompt || lastGmEntry.content || 'current scene';
  const prompt = String(promptSource).trim().slice(0, 300) || 'current scene';
  vscode.postMessage({
    type: 'generateImage',
    prompt,
    mode: 'illustrious',
    entryId: lastGmEntry.id
  });
  addSystemMessage(T('webview.image.requested'));
});

// ===== ユーティリティ =====
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatLog.scrollTop = chatLog.scrollHeight;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// キャラ名ごとの色を自動割り当て
const characterColors = {};
const colorPalette = [
  '#7cb3ff', // GM blue
  '#a8d8a8', // Player green
  '#ff9ebc', // NPC pink
  '#ffd700', // gold
  '#c8a8ff', // lavender
  '#ff8c42', // orange
  '#42f5e3', // cyan
  '#f5e642', // yellow
];
let colorIndex = 2; // 0=GM, 1=Player already assigned

function getCharacterColor(name) {
  if (name === 'Game Master' || name === 'GM' || name === T('webview.sender.gm')) return colorPalette[0];
  if (name === 'Player' || name === T('webview.sender.player')) return colorPalette[1];
  if (name === 'System' || name === T('webview.sender.system')) return '#ffd700';
  if (!characterColors[name]) {
    characterColors[name] = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
  }
  return characterColors[name];
}

function saveState() {
  const draftText = freeInput ? freeInput.value : '';
  const noteEl = document.getElementById('authors-note-input');
  const authorsNoteText = noteEl ? noteEl.value : '';
  vscode.setState({ messageHistory, galleryImages, currentTheme, ttsEnabled, ttsSpeed, ttsVolume, draftText, authorsNoteText });
}

// ===== 画像生成ローディング =====
function showImageLoading() {
  if (document.getElementById('img-loading')) return;
  const div = document.createElement('div');
  div.id = 'img-loading';
  div.className = 'msg system';
  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.style.color = '#ffd700';
  sender.textContent = T('webview.sender.system');
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = T('webview.image.loading');
  div.appendChild(sender);
  div.appendChild(body);
  chatLog.appendChild(div);
  scrollToBottom();
}

function hideImageLoading(success) {
  const el = document.getElementById('img-loading');
  if (el) el.remove();
  if (success === false) {
    addSystemMessage(T('webview.image.failed'));
  }
}

// ===== GM ターン待ちローディング =====
function showGmLoading() {
  if (document.getElementById('gm-loading')) { return; }
  const div = document.createElement('div');
  div.id = 'gm-loading';
  div.className = 'msg gm';
  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.style.color = '#7cb3ff';
  sender.textContent = T('webview.sender.gm');
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = T('webview.gm.loading');
  div.appendChild(sender);
  div.appendChild(body);
  chatLog.appendChild(div);
  scrollToBottom();
  // 入力をロック（二重送信防止）
  freeInput.disabled = true;
  sendBtn.disabled = true;
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
}

function hideGmLoading(success) {
  const el = document.getElementById('gm-loading');
  if (el) { el.remove(); }
  freeInput.disabled = false;
  sendBtn.disabled = false;
  document.querySelectorAll('.option-btn').forEach(b => { b.disabled = false; });
  if (success === false) {
    addSystemMessage(T('webview.gm.failed'));
  }
}

```

### webview/modules\30-bgm-sfx.js
```javascript
// ===== BGM プレイヤー =====
// マニフェスト（extension が bgm.json を解決して webview URI 付きで送ってくる）
// 各 track: { id, uri, mood, description, loop, volume }
let bgmTracks = [];
let bgmCurrentId = null;
let bgmEnabled = true;
let bgmUserMuted = false;
let bgmBaseVolume = 0.5; // 0..1 ユーザー音量
let bgmAudioReady = false; // ユーザー操作で自動再生が解禁されたか

const bgmNowEl = document.getElementById('bgm-now');
const bgmListEl = document.getElementById('bgm-list');
const bgmEmptyEl = document.getElementById('bgm-empty');
const bgmToggleBtn = document.getElementById('bgm-toggle');
const bgmVolumeEl = document.getElementById('bgm-volume');
const bgmMuteBtn = document.getElementById('bgm-mute');

// 2つの audio 要素でクロスフェード
const bgmAudioA = new Audio();
const bgmAudioB = new Audio();
let bgmActive = bgmAudioA;
let bgmIdle = bgmAudioB;
[bgmAudioA, bgmAudioB].forEach(a => { a.preload = 'auto'; });

function setBgmManifest(tracks, defaultVolume, enabled) {
  bgmTracks = Array.isArray(tracks) ? tracks : [];
  if (typeof defaultVolume === 'number') {
    bgmBaseVolume = Math.min(1, Math.max(0, defaultVolume / 100));
    bgmVolumeEl.value = String(Math.round(bgmBaseVolume * 100));
  }
  if (typeof enabled === 'boolean') bgmEnabled = enabled;
  renderBgmList();
}

function renderBgmList() {
  bgmListEl.innerHTML = '';
  if (!bgmTracks.length) {
    bgmEmptyEl.style.display = 'block';
    bgmNowEl.textContent = '♪ ---';
    return;
  }
  bgmEmptyEl.style.display = 'none';
  for (const t of bgmTracks) {
    const item = document.createElement('button');
    item.className = 'bgm-item' + (t.id === bgmCurrentId ? ' active' : '');
    item.textContent = t.id;
    if (t.description) item.title = t.description;
    item.addEventListener('click', () => {
      bgmAudioReady = true; // ユーザー操作
      playBgmById(t.id);
    });
    bgmListEl.appendChild(item);
  }
}

function findTrack(id) {
  return bgmTracks.find(t => t.id === id);
}

function playBgmByMood(mood) {
  if (!mood) return;
  const m = String(mood).toLowerCase();
  // mood フィールドが一致するトラックを探す（カンマ区切り複数対応）
  const match = bgmTracks.find(t => {
    if (!t.mood) return false;
    return String(t.mood).toLowerCase().split(',').map(s => s.trim()).includes(m);
  });
  if (match) playBgmById(match.id);
}

function playBgmById(id) {
  if (!bgmEnabled) return;
  const track = findTrack(id);
  if (!track || !track.uri) return;
  if (id === bgmCurrentId && !bgmActive.paused) return; // 既に再生中

  bgmCurrentId = id;
  bgmNowEl.textContent = '♪ ' + id;
  renderBgmList();

  // 自動再生がまだ解禁されていない場合は「曲名だけ表示」して待機
  if (!bgmAudioReady) {
    bgmNowEl.textContent = '♪ ' + id + T('webview.bgm.clickToPlay');
    return;
  }

  crossfadeTo(track);
}

function effectiveVolume(track) {
  const trackVol = (track && typeof track.volume === 'number') ? Math.min(1, Math.max(0, track.volume)) : 1;
  return bgmUserMuted ? 0 : bgmBaseVolume * trackVol;
}

function crossfadeTo(track) {
  const target = effectiveVolume(track);

  // idle 側に新トラックをロードして再生
  bgmIdle.src = track.uri;
  bgmIdle.loop = track.loop !== false; // 既定 loop:true
  bgmIdle.volume = 0;
  const playPromise = bgmIdle.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch(() => { /* 自動再生ブロック時は無視 */ });
  }
  bgmToggleBtn.textContent = '⏸';

  const fadeMs = 1200;
  const steps = 24;
  const fadingOut = bgmActive;
  const fadingIn = bgmIdle;
  const startOutVol = fadingOut.volume;
  let i = 0;
  const timer = setInterval(() => {
    i++;
    const r = i / steps;
    fadingIn.volume = Math.min(target, target * r);
    fadingOut.volume = Math.max(0, startOutVol * (1 - r));
    if (i >= steps) {
      clearInterval(timer);
      fadingOut.pause();
      // active/idle を入れ替え
      const tmp = bgmActive; bgmActive = bgmIdle; bgmIdle = tmp;
    }
  }, fadeMs / steps);
}

function applyBgmVolume() {
  const track = findTrack(bgmCurrentId);
  bgmActive.volume = effectiveVolume(track);
}

// UI: 再生/一時停止トグル
bgmToggleBtn.addEventListener('click', () => {
  bgmAudioReady = true;
  if (bgmActive.paused) {
    if (!bgmActive.src && bgmCurrentId) {
      playBgmById(bgmCurrentId);
    } else if (bgmActive.src) {
      bgmActive.play().catch(() => {});
      bgmToggleBtn.textContent = '⏸';
    } else if (bgmTracks.length) {
      playBgmById(bgmTracks[0].id);
    }
  } else {
    bgmActive.pause();
    bgmToggleBtn.textContent = '▶';
  }
});

[bgmAudioA, bgmAudioB].forEach(a => {
  a.addEventListener('play', () => { if (a === bgmActive) bgmToggleBtn.textContent = '⏸'; });
  a.addEventListener('pause', () => { if (a === bgmActive) bgmToggleBtn.textContent = '▶'; });
});

// UI: 音量スライダー
bgmVolumeEl.addEventListener('input', () => {
  bgmBaseVolume = Math.min(1, Math.max(0, parseInt(bgmVolumeEl.value, 10) / 100));
  applyBgmVolume();
});

// UI: ミュート
bgmMuteBtn.addEventListener('click', () => {
  bgmUserMuted = !bgmUserMuted;
  bgmMuteBtn.textContent = bgmUserMuted ? '🔇' : '🔊';
  applyBgmVolume();
});

// ===== 効果音(SE) =====
// マニフェスト（extension が sfx.json を解決して webview URI 付きで送る）
// 各 sound: { id, uri, description, volume }
let sfxSounds = [];
let sfxEnabled = true;
let sfxMuted = false;
let sfxBaseVolume = 0.7;

const sfxVolumeEl = document.getElementById('sfx-volume');
const sfxMuteBtn = document.getElementById('sfx-mute');

function setSfxManifest(sounds, defaultVolume, enabled) {
  sfxSounds = Array.isArray(sounds) ? sounds : [];
  if (typeof defaultVolume === 'number') {
    sfxBaseVolume = Math.min(1, Math.max(0, defaultVolume / 100));
    if (sfxVolumeEl) sfxVolumeEl.value = String(Math.round(sfxBaseVolume * 100));
  }
  if (typeof enabled === 'boolean') sfxEnabled = enabled;
}

function playSfx(id) {
  if (!sfxEnabled || sfxMuted) return;
  const s = sfxSounds.find(x => x.id === id);
  if (!s || !s.uri) return;
  // ワンショット: 毎回新しい Audio で重ね再生（BGM を止めない）
  const a = new Audio(s.uri);
  const sv = (typeof s.volume === 'number') ? Math.min(1, Math.max(0, s.volume)) : 1;
  a.volume = Math.min(1, Math.max(0, sfxBaseVolume * sv));
  a.play().catch(() => { /* 自動再生ブロック時は無視 */ });
}

// Promise を返す版 — 音が実際に鳴ったかどうか検出できる
async function playSfxAsync(id) {
  if (!sfxEnabled || sfxMuted) return false;
  const s = sfxSounds.find(x => x.id === id);
  if (!s || !s.uri) return false;
  const a = new Audio(s.uri);
  const sv = (typeof s.volume === 'number') ? Math.min(1, Math.max(0, s.volume)) : 1;
  a.volume = Math.min(1, Math.max(0, sfxBaseVolume * sv));
  try { await a.play(); return true; } catch { return false; }
}

if (sfxVolumeEl) {
  sfxVolumeEl.addEventListener('input', () => {
    sfxBaseVolume = Math.min(1, Math.max(0, parseInt(sfxVolumeEl.value, 10) / 100));
  });
}
if (sfxMuteBtn) {
  sfxMuteBtn.addEventListener('click', () => {
    sfxMuted = !sfxMuted;
    sfxMuteBtn.textContent = sfxMuted ? '🔇' : '🔔';
  });
}

```

### webview/modules\40-dice-calc-tabs.js
```javascript
// ===== ダイスローラー =====
const diceResultEl = document.getElementById('dice-result');
const diceLogEl = document.getElementById('dice-log');
const diceSendGmBtn = document.getElementById('dice-send-gm');
let diceHistory = [];
let lastDiceRoll = '';

function rollDice(count, sides, skipSound = false) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides) + 1);
  }
  const total = results.reduce((a, b) => a + b, 0);
  const label = count === 1 ? `d${sides}` : `${count}d${sides}`;

  // 結果表示（アニメーション風に）
  diceResultEl.textContent = `${total}`;
  diceResultEl.style.transform = 'scale(1.2)';
  setTimeout(() => { diceResultEl.style.transform = 'scale(1)'; }, 150);

  // ログに追加
  const detail = count > 1 ? ` [${results.join(' + ')}]` : '';
  const logText = `${label}: ${total}${detail}`;
  lastDiceRoll = logText;
  if (diceSendGmBtn) diceSendGmBtn.disabled = false;

  diceHistory.unshift(logText);
  if (diceHistory.length > 5) diceHistory.pop();
  diceLogEl.textContent = diceHistory.join(' | ');

  // ゲームログにも通知
  addSystemMessage(`${T('webview.dice.logPrefix')} ${logText}`);

  // ダイスSEを再生（あれば）
  if (!skipSound) { playSfx('dice'); }
}

// GM からのダイス要求を処理 — 自動ロールし音の成否でフォールバックを判定
async function handleDiceRequest(req) {
  const notation = (req.notation || '').trim();
  const purposeText = req.purpose ? `（${req.purpose}）` : '';
  const match = /^(\d+)d(\d+)$/i.exec(notation);

  if (!match) {
    // 形式不明 — 手動ロールを促す
    addSystemMessage(T('webview.dice.requestInvalid', { notation: notation || '?' }) + purposeText);
    return;
  }

  const count = Math.max(1, Math.min(100, parseInt(match[1], 10)));
  const sides = Math.max(2, Math.min(10000, parseInt(match[2], 10)));

  // バナー表示
  addSystemMessage(T('webview.dice.requestBanner', { notation }) + purposeText);

  // 音なしで自動ロール → 別途 playSfxAsync で音を鳴らして成否を検出
  rollDice(count, sides, true);
  const soundOk = await playSfxAsync('dice');

  if (!soundOk) {
    addSystemMessage(T('webview.dice.requestFallback'));
  }
}

function sendDiceResultToGm() {
  if (!lastDiceRoll) return;
  const text = `${T('webview.dice.sendPrefix')} ${lastDiceRoll}`;
  vscode.postMessage({ type: 'freeInput', text });
  const entry = { id: `user-${Date.now()}`, role: 'user', content: text, sender: T('webview.sender.player') };
  messageHistory.push(entry);
  renderMessage(entry);
  scrollToBottom();
  saveState();
}

if (diceSendGmBtn) {
  diceSendGmBtn.disabled = true;
  diceSendGmBtn.addEventListener('click', sendDiceResultToGm);
}

// プリセットボタン（1d固定）
document.querySelectorAll('.dice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sides = parseInt(btn.dataset.sides, 10);
    rollDice(1, sides);
  });
});

// カスタムロール
document.getElementById('dice-custom-btn').addEventListener('click', () => {
  const count = Math.max(1, Math.min(100, parseInt(document.getElementById('dice-count').value, 10) || 1));
  const sides = Math.max(2, Math.min(10000, parseInt(document.getElementById('dice-sides').value, 10) || 6));
  rollDice(count, sides);
});

// ===== 電卓 =====
const calcResultEl = document.getElementById('calc-result');
const calcHistoryEl = document.getElementById('calc-history');
const calcInput = document.getElementById('calc-input');
let calcHistory = [];

// Function()/eval を使わない安全な再帰下降パーサー
function evaluateMath(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    if (/\s/.test(str[i])) { i++; continue; }
    if (/[\d.]/.test(str[i])) {
      let num = '';
      while (i < str.length && /[\d.]/.test(str[i])) num += str[i++];
      const n = Number(num);
      if (isNaN(n)) throw new Error('invalid number');
      tokens.push({ t: 'n', v: n });
    } else if (['+', '-', '*', '/', '^', '%', '(', ')'].includes(str[i])) {
      tokens.push({ t: 'o', v: str[i++] });
    } else {
      throw new Error('invalid char: ' + str[i]);
    }
  }
  let pos = 0;
  const peek = () => tokens[pos] || null;
  const consume = () => tokens[pos++];
  function parseExpr() { return parseAddSub(); }
  function parseAddSub() {
    let val = parseMulDiv();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = consume().v;
      const r = parseMulDiv();
      val = op === '+' ? val + r : val - r;
    }
    return val;
  }
  function parseMulDiv() {
    let val = parsePow();
    while (peek() && ['*', '/', '%'].includes(peek().v)) {
      const op = consume().v;
      const r = parsePow();
      val = op === '*' ? val * r : op === '/' ? val / r : val % r;
    }
    return val;
  }
  function parsePow() {
    const val = parseUnary();
    if (peek() && peek().v === '^') { consume(); return Math.pow(val, parsePow()); }
    return val;
  }
  function parseUnary() {
    if (peek() && peek().v === '-') { consume(); return -parseUnary(); }
    if (peek() && peek().v === '+') { consume(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('unexpected end');
    if (t.t === 'n') { consume(); return t.v; }
    if (t.v === '(') {
      consume();
      const val = parseExpr();
      if (!peek() || peek().v !== ')') throw new Error('expected )');
      consume();
      return val;
    }
    throw new Error('unexpected: ' + t.v);
  }
  const result = parseExpr();
  if (pos < tokens.length) throw new Error('trailing tokens');
  return result;
}

function calculate() {
  const expr = calcInput.value.trim();
  if (!expr) return;
  try {
    const result = evaluateMath(expr);
    if (!isFinite(result)) { calcResultEl.textContent = T('webview.calc.infinityError'); return; }
    const rounded = Math.round(result * 1e10) / 1e10;
    calcResultEl.textContent = `= ${rounded}`;
    calcHistory.unshift(`${expr} = ${rounded}`);
    if (calcHistory.length > 5) calcHistory.pop();
    calcHistoryEl.innerHTML = calcHistory.map(h => `<div>${escapeHtml(h)}</div>`).join('');
  } catch (e) {
    calcResultEl.textContent = T('webview.calc.error');
  }
}

document.getElementById('calc-btn').addEventListener('click', calculate);
calcInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    calculate();
  }
});

// ===== タブ切り替え =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
    
    btn.classList.add('active');
    const targetId = btn.dataset.target;
    document.getElementById(targetId).style.display = 'flex';
    
    if (targetId === 'pane-character') {
      vscode.postMessage({ type: 'loadCharacters' });
    }
  });
});

```

### webview/modules\50-character-saga.js
```javascript
// ===== Character Profile ロジック =====
let currentCharacters = [];
let activeCharId = null;
let currentPartyIds = [];

const charSelect = document.getElementById('char-select');
const charPartyCb = document.getElementById('char-party-cb');
const charNameInput = document.getElementById('char-name');
const charControlledBySelect = document.getElementById('char-controlled-by');
const charLlmProviderSelect = document.getElementById('char-llm-provider');
const charLlmModelInput = document.getElementById('char-llm-model');
const charDescInput = document.getElementById('char-desc');
const charPersonalityInput = document.getElementById('char-personality');
const charPortraitImg = document.getElementById('char-portrait-img');
const charPortraitPlaceholder = document.getElementById('char-portrait-placeholder');

const charEquipWeapon = document.getElementById('char-equip-weapon');
const charEquipArmor = document.getElementById('char-equip-armor');
const charEquipAccessory = document.getElementById('char-equip-accessory');
const charEquipNotifyBtn = document.getElementById('char-equip-notify-btn');

// ===== あらすじ / Saga アーカイブ =====

function showArchiveSuggest(count, threshold, tier) {
  const banner = document.getElementById('archive-suggest-banner');
  const textEl = document.getElementById('archive-suggest-text');
  if (!banner || !textEl) return;
  const tierLabel = tier === 'large'
    ? T('webview.saga.suggestTierLarge')
    : T('webview.saga.suggestTierSmall');
  textEl.textContent = T('webview.saga.suggestBanner', { count, threshold, tier: tierLabel });
  banner.style.display = 'flex';
}

function hideArchiveSuggest() {
  const banner = document.getElementById('archive-suggest-banner');
  if (banner) banner.style.display = 'none';
}

function resetSummarizeButton() {
  const btn = document.getElementById('summarize-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = T('webview.summary.generate');
}

/** Saga アーカイブ完了後にボタンを元に戻す */
function resetArchiveButton() {
  const btn = document.getElementById('archive-saga-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = T('webview.saga.archive');
}

function updateCharacterList(characters, activeId, partyIds) {
  currentCharacters = characters || [];
  window.currentCharacters = currentCharacters;
  activeCharId = activeId;
  currentPartyIds = partyIds || [];
  
  const currentSelection = charSelect.value;
  charSelect.innerHTML = '';
  const newOpt = document.createElement('option');
  newOpt.value = 'new';
  newOpt.textContent = T('webview.character.newOption');
  charSelect.appendChild(newOpt);

  const activeSuffix = T('webview.character.activeSuffix');
  currentCharacters.forEach(char => {
    const opt = document.createElement('option');
    opt.value = char.id;
    opt.textContent = (char.name || char.id) + (char.id === activeId ? activeSuffix : '');
    charSelect.appendChild(opt);
  });
  
  // 選択状態を復元、または Active キャラクターを選択
  if (currentSelection !== 'new' && currentCharacters.find(c => c.id === currentSelection)) {
    charSelect.value = currentSelection;
  } else if (activeId && currentCharacters.find(c => c.id === activeId)) {
    charSelect.value = activeId;
  }
  
  loadSelectedCharacter();
}

function loadSelectedCharacter() {
  const id = charSelect.value;
  if (id === 'new') {
    charNameInput.value = '';
    charControlledBySelect.value = 'gm';
    charLlmProviderSelect.value = '';
    charLlmModelInput.value = '';
    charDescInput.value = '';
    charPersonalityInput.value = '';
    charPortraitImg.src = '';
    charPortraitImg.style.display = 'none';
    charPortraitPlaceholder.style.display = 'flex';
    if (charEquipWeapon) charEquipWeapon.value = '';
    if (charEquipArmor) charEquipArmor.value = '';
    if (charEquipAccessory) charEquipAccessory.value = '';
    if (charPartyCb) {
      charPartyCb.checked = false;
      charPartyCb.disabled = true;
    }
  } else {
    if (charPartyCb) {
      charPartyCb.disabled = false;
      charPartyCb.checked = currentPartyIds.includes(id);
    }
    const char = currentCharacters.find(c => c.id === id);
    if (char) {
      charNameInput.value = char.name || '';
      charControlledBySelect.value = char.controlledBy || 'gm';
      charLlmProviderSelect.value = char.llmProvider || '';
      charLlmModelInput.value = char.llmModel || '';
      charDescInput.value = char.description || '';
      charPersonalityInput.value = char.personality || '';
      if (charEquipWeapon) charEquipWeapon.value = char.equipment?.weapon || '';
      if (charEquipArmor) charEquipArmor.value = char.equipment?.armor || '';
      if (charEquipAccessory) charEquipAccessory.value = char.equipment?.accessory || '';
      if (char.portrait) {
        charPortraitImg.src = char.portrait;
        charPortraitImg.style.display = 'block';
        charPortraitPlaceholder.style.display = 'none';
      } else {
        charPortraitImg.style.display = 'none';
        charPortraitPlaceholder.style.display = 'flex';
      }
    }
  }
}

charSelect.addEventListener('change', () => {
  loadSelectedCharacter();
  if (charSelect.value !== 'new') {
    vscode.postMessage({ type: 'setActiveCharacter', id: charSelect.value });
  }
});

document.getElementById('char-save-btn').addEventListener('click', () => {
  let id = charSelect.value;
  if (id === 'new') {
    id = 'char_' + Date.now();
  }
  
  const character = {
    id: id,
    name: charNameInput.value.trim(),
    controlledBy: charControlledBySelect.value,
    llmProvider: charLlmProviderSelect.value,
    llmModel: charLlmModelInput.value.trim(),
    description: charDescInput.value.trim(),
    personality: charPersonalityInput.value.trim(),
    equipment: {
      weapon: charEquipWeapon ? charEquipWeapon.value.trim() : '',
      armor: charEquipArmor ? charEquipArmor.value.trim() : '',
      accessory: charEquipAccessory ? charEquipAccessory.value.trim() : ''
    }
  };
  
  // 既存のportrait等を保持
  const existing = currentCharacters.find(c => c.id === id);
  if (existing && existing.portrait) {
    character.portrait = existing.portrait;
  }
  
  vscode.postMessage({ type: 'saveCharacter', character, inParty: charPartyCb.checked });
  if (charSelect.value === 'new') {
    vscode.postMessage({ type: 'setActiveCharacter', id });
  }
});

charPartyCb.addEventListener('change', () => {
  const id = charSelect.value;
  if (id === 'new') return;
  vscode.postMessage({ type: charPartyCb.checked ? 'addToParty' : 'removeFromParty', id });
});

if (charEquipNotifyBtn) {
  charEquipNotifyBtn.addEventListener('click', () => {
    const weapon = charEquipWeapon ? charEquipWeapon.value.trim() : '';
    const armor = charEquipArmor ? charEquipArmor.value.trim() : '';
    const accessory = charEquipAccessory ? charEquipAccessory.value.trim() : '';
    vscode.postMessage({
      type: 'notifyEquipment',
      id: charSelect.value,
      name: charNameInput.value.trim(),
      weapon,
      armor,
      accessory
    });
  });
}

document.getElementById('summarize-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'summarizeHistory' });
  const btn = document.getElementById('summarize-btn');
  btn.textContent = T('webview.summary.generating');
  btn.disabled = true;
});

document.getElementById('archive-saga-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'archiveSaga' });
  const btn = document.getElementById('archive-saga-btn');
  btn.textContent = T('webview.saga.archiving');
  btn.disabled = true;
});

document.getElementById('archive-suggest-btn')?.addEventListener('click', () => {
  hideArchiveSuggest();
  vscode.postMessage({ type: 'archiveSaga' });
  const btn = document.getElementById('archive-saga-btn');
  if (btn) {
    btn.textContent = T('webview.saga.archiving');
    btn.disabled = true;
  }
});

document.getElementById('archive-suggest-dismiss')?.addEventListener('click', () => {
  hideArchiveSuggest();
});

document.getElementById('story-summary').addEventListener('blur', (e) => {
  vscode.postMessage({ type: 'updateSummary', summary: e.target.value });
});

document.getElementById('char-import-st-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'importTavernCard' });
});

document.getElementById('char-upload-btn').addEventListener('click', () => {
  const id = charSelect.value;
  if (id === 'new') {
    // VSCode Webviewのalertは使えないのでSystemメッセージなどで警告すべきだが簡易的にreturn
    return;
  }
  vscode.postMessage({ type: 'uploadPortrait', id });
});

document.getElementById('char-generate-btn').addEventListener('click', () => {
  const id = charSelect.value;
  if (id === 'new') return;
  vscode.postMessage({ type: 'generatePortrait', id });
});

// ===== メッセージインライン編集 =====
function startInlineEdit(msgDiv, entry, editBtn) {
  const bodyEl = msgDiv.querySelector('.msg-body');
  if (!bodyEl || msgDiv.dataset.editing) { return; }
  msgDiv.dataset.editing = '1';
  editBtn.disabled = true;

  const original = entry.content;
  const ta = document.createElement('textarea');
  ta.className = 'msg-edit-textarea';
  ta.value = original;
  ta.rows = Math.max(3, original.split('\n').length + 1);

  const btnRow = document.createElement('div');
  btnRow.className = 'msg-edit-btnrow';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = T('webview.msg.editSave') || '💾 Save';
  saveBtn.onclick = () => {
    const newContent = ta.value.trim();
    if (newContent && newContent !== original) {
      entry.content = newContent;
      bodyEl.textContent = newContent;
      vscode.postMessage({ type: 'editEntry', id: entry.id, content: newContent });
    }
    finishEdit();
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = T('webview.msg.editCancel') || '✕ Cancel';
  cancelBtn.onclick = finishEdit;

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);

  bodyEl.style.display = 'none';
  bodyEl.insertAdjacentElement('afterend', ta);
  ta.insertAdjacentElement('afterend', btnRow);
  ta.focus();

  function finishEdit() {
    ta.remove();
    btnRow.remove();
    bodyEl.style.display = '';
    editBtn.disabled = false;
    delete msgDiv.dataset.editing;
  }
}

```

### webview/modules\55-remote-play.js
```javascript
// ===== Remote Play (LAN player screen) =====
let remotePlayActive = false;

function updateRemotePlayButton(status) {
  const btn = document.getElementById('remote-play-btn');
  if (!btn) { return; }
  remotePlayActive = Boolean(status && status.running);
  btn.classList.toggle('active', remotePlayActive);
  const clients = status && typeof status.clientCount === 'number' ? status.clientCount : 0;
  btn.title = remotePlayActive
    ? `${T('webview.remotePlay.active')} (${clients})`
    : T('webview.remotePlay.toggle');
  renderRemotePlayPanel(status);
}

function renderRemotePlayPanel(status) {
  const panel = document.getElementById('remote-play-panel');
  if (!panel) { return; }

  const running = Boolean(status && status.running);
  panel.classList.toggle('hidden', !running);
  if (!running) {
    return;
  }

  const playerUrl = (status.urls && status.urls[0]) || '';
  const spectatorUrl = (status.spectatorUrls && status.spectatorUrls[0]) || '';
  const playerUrlEl = document.getElementById('remote-play-player-url');
  const spectatorUrlEl = document.getElementById('remote-play-spectator-url');
  const clientsEl = document.getElementById('remote-play-clients');

  if (playerUrlEl) { playerUrlEl.textContent = playerUrl; }
  if (spectatorUrlEl) { spectatorUrlEl.textContent = spectatorUrl; }

  if (clientsEl) {
    clientsEl.innerHTML = '';
    const clients = status.clients || [];
    if (!clients.length) {
      clientsEl.innerHTML = `<span class="empty-text">${T('webview.remotePlay.noClients')}</span>`;
    } else {
      clients.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'remote-client-row';
        const roleLabel = c.role === 'spectator'
          ? T('webview.remotePlay.roleSpectator')
          : T('webview.remotePlay.rolePlayer');
        row.textContent = `${c.id} · ${roleLabel}`;
        clientsEl.appendChild(row);
      });
    }
  }

  panel.dataset.playerUrl = playerUrl;
  panel.dataset.spectatorUrl = spectatorUrl;
}

(function initRemotePlayUi() {
  const btn = document.getElementById('remote-play-btn');
  const panel = document.getElementById('remote-play-panel');
  const closeBtn = document.getElementById('remote-play-close');
  const stopBtn = document.getElementById('remote-play-stop-btn');
  const copyPlayerBtn = document.getElementById('remote-play-copy-player');
  const copySpectatorBtn = document.getElementById('remote-play-copy-spectator');

  if (!btn) { return; }

  btn.addEventListener('click', () => {
    if (remotePlayActive && panel) {
      panel.classList.toggle('hidden');
      return;
    }
    vscode.postMessage({ type: 'toggleRemotePlay' });
  });

  if (closeBtn && panel) {
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleRemotePlay' });
    });
  }
  if (copyPlayerBtn) {
    copyPlayerBtn.addEventListener('click', () => {
      const url = panel ? panel.dataset.playerUrl : '';
      if (url) {
        vscode.postMessage({ type: 'copyRemotePlayUrl', url, role: 'player' });
      }
    });
  }
  if (copySpectatorBtn) {
    copySpectatorBtn.addEventListener('click', () => {
      const url = panel ? panel.dataset.spectatorUrl : '';
      if (url) {
        vscode.postMessage({ type: 'copyRemotePlayUrl', url, role: 'spectator' });
      }
    });
  }
})();
```

### webview/modules\60-tts-quickreply-imagegen.js
```javascript
// ===== AI音声ナレーション (TTS) コアロジック =====
function getBestVoiceForLocale(locale) {
  if (!window.speechSynthesis) return null;
  const langMap = {
    'ja': 'ja-JP',
    'en': 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW'
  };
  const targetLang = langMap[locale] || 'en-US';
  const voices = window.speechSynthesis.getVoices();
  
  // 1. 完全一致
  let matched = voices.filter(v => v.lang === targetLang || v.lang.replace('_', '-').startsWith(targetLang));
  if (matched.length > 0) {
    const localVoice = matched.find(v => v.localService);
    return localVoice || matched[0];
  }
  
  // 2. 部分一致 (言語コードの先頭部分が一致)
  const baseLang = targetLang.split('-')[0];
  matched = voices.filter(v => v.lang.startsWith(baseLang));
  if (matched.length > 0) {
    return matched[0];
  }
  
  return null;
}

// ===== Quick Reply バー =====
(function initQuickReplyBar() {
  const qrUndo = document.getElementById('qr-undo');
  if (qrUndo) {
    qrUndo.addEventListener('click', () => {
      window.speechSynthesis?.cancel();
      vscode.postMessage({ type: 'undoLastTurn' });
    });
  }

  const qrRetry = document.getElementById('qr-retry');
  if (qrRetry) {
    qrRetry.addEventListener('click', () => {
      if (isInputLocked()) { return; }
      window.speechSynthesis?.cancel();
      vscode.postMessage({ type: 'regenerateLastTurn' });
    });
  }

  const qrCheckpoint = document.getElementById('qr-checkpoint');
  if (qrCheckpoint) {
    qrCheckpoint.addEventListener('click', () => {
      const label = prompt(T('webview.checkpoint.savePrompt') || 'Checkpoint label:', '') ?? '';
      vscode.postMessage({ type: 'saveCheckpoint', label });
    });
  }

  const qrSummary = document.getElementById('qr-summary');
  if (qrSummary) {
    qrSummary.addEventListener('click', () => {
      vscode.postMessage({ type: 'summarizeHistory' });
      const btn = document.getElementById('summarize-btn');
      if (btn) { btn.textContent = T('webview.summary.generating'); btn.disabled = true; }
    });
  }

  const qrGenImage = document.getElementById('qr-genimage');
  if (qrGenImage) {
    qrGenImage.addEventListener('click', () => {
      const lastGm = [...messageHistory].reverse().find((m) => m && m.role === 'gm' && m.id);
      if (!lastGm) { addSystemMessage(T('webview.image.noTurn')); return; }
      const prompt = String(lastGm.imagePrompt || lastGm.content || 'current scene').trim().slice(0, 300) || 'current scene';
      vscode.postMessage({ type: 'generateImage', prompt, entryId: lastGm.id });
      addSystemMessage(T('webview.image.requested'));
    });
  }

  const qrLoadPack = document.getElementById('qr-loadpack');
  if (qrLoadPack) {
    qrLoadPack.addEventListener('click', () => {
      vscode.postMessage({ type: 'loadScenario' });
    });
  }

  const qrArchive = document.getElementById('qr-archive');
  if (qrArchive) {
    qrArchive.addEventListener('click', () => {
      vscode.postMessage({ type: 'archiveSaga' });
      const btn = document.getElementById('archive-saga-btn');
      if (btn) { btn.textContent = T('webview.saga.archiving'); btn.disabled = true; }
    });
  }

  const qrExport = document.getElementById('qr-export');
  if (qrExport) {
    qrExport.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportHtml' });
    });
  }

  const qrForceSpeak = document.getElementById('qr-forcespeak');
  if (qrForceSpeak) {
    qrForceSpeak.addEventListener('click', () => {
      vscode.postMessage({ type: 'requestForceSpeak' });
    });
  }
})();

// ===== Image Gen Settings パネル =====
let imageGenConfigDraft = null;
let imageGenSaveTimer = null;

function applyImageGenConfigForm(config) {
  imageGenConfigDraft = config;
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) { el.value = value ?? ''; }
  };
  setVal('ig-checkpoint', config.checkpoint || '');
  setVal('ig-mode', config.mode || 'illustrious');
  setVal('ig-steps', config.steps ?? 0);
  setVal('ig-cfg', config.cfg ?? 0);
  setVal('ig-width', config.width ?? 0);
  setVal('ig-height', config.height ?? 0);
  setVal('ig-sampler', config.samplerName || '');
  setVal('ig-scheduler', config.scheduler || '');
  setVal('ig-pos-prefix', config.positivePrefix || '');
  setVal('ig-pos-suffix', config.positiveSuffix || '');
  setVal('ig-negative', config.negativePrompt || '');
  const tpl = config.templates || {};
  setVal('ig-tpl-scene', tpl.scene || '');
  setVal('ig-tpl-portrait', tpl.portrait || '');
  setVal('ig-tpl-background', tpl.background || '');
  setVal('ig-tpl-freeform', tpl.freeform || '');
}

function collectImageGenConfigFromForm() {
  const num = (id) => {
    const el = document.getElementById(id);
    const v = el ? Number(el.value) : 0;
    return Number.isFinite(v) ? v : 0;
  };
  const str = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.value).trim() : '';
  };
  return {
    checkpoint: str('ig-checkpoint'),
    mode: str('ig-mode') || 'illustrious',
    steps: num('ig-steps'),
    cfg: num('ig-cfg'),
    width: num('ig-width'),
    height: num('ig-height'),
    samplerName: str('ig-sampler'),
    scheduler: str('ig-scheduler'),
    positivePrefix: str('ig-pos-prefix'),
    positiveSuffix: str('ig-pos-suffix'),
    negativePrompt: str('ig-negative'),
    templates: {
      scene: str('ig-tpl-scene'),
      portrait: str('ig-tpl-portrait'),
      background: str('ig-tpl-background'),
      freeform: str('ig-tpl-freeform')
    }
  };
}

function scheduleImageGenConfigSave() {
  if (imageGenSaveTimer) { clearTimeout(imageGenSaveTimer); }
  imageGenSaveTimer = setTimeout(() => {
    imageGenSaveTimer = null;
    const config = collectImageGenConfigFromForm();
    vscode.postMessage({ type: 'updateImageGenConfig', config });
    const savedEl = document.getElementById('img-gen-saved');
    if (savedEl) {
      savedEl.classList.remove('hidden');
      setTimeout(() => savedEl.classList.add('hidden'), 1500);
    }
  }, 400);
}

function setImageGenPanelOpen(open) {
  const panel = document.getElementById('img-gen-panel');
  const backdrop = document.getElementById('img-gen-backdrop');
  if (!panel || !backdrop) { return; }
  panel.classList.toggle('hidden', !open);
  backdrop.classList.toggle('hidden', !open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) {
    vscode.postMessage({ type: 'requestImageGenConfig' });
  }
}

(function initImageGenSettingsPanel() {
  const openBtn = document.getElementById('img-gen-settings-btn');
  const closeBtn = document.getElementById('img-gen-panel-close');
  const backdrop = document.getElementById('img-gen-backdrop');
  const panel = document.getElementById('img-gen-panel');

  openBtn?.addEventListener('click', () => setImageGenPanelOpen(true));
  closeBtn?.addEventListener('click', () => setImageGenPanelOpen(false));
  backdrop?.addEventListener('click', () => setImageGenPanelOpen(false));

  panel?.querySelectorAll('.img-gen-input, .img-gen-textarea').forEach((el) => {
    el.addEventListener('change', scheduleImageGenConfigSave);
    el.addEventListener('blur', scheduleImageGenConfigSave);
  });
})();

function speakText(text) {
  if (!ttsEnabled || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  
  window.speechSynthesis.cancel();
  
  if (typeof text !== 'string') return;
  
  // Treat GM text as plain speech input; do not parse it as HTML.
  const plainText = text.replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (plainText === '') return;

  const utterance = new SpeechSynthesisUtterance(plainText);
  utterance.rate = ttsSpeed;
  utterance.volume = ttsVolume;
  
  const langMap = {
    'ja': 'ja-JP',
    'en': 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW'
  };
  utterance.lang = langMap[currentLocale] || 'en-US';
  
  const voice = getBestVoiceForLocale(currentLocale);
  if (voice) {
    utterance.voice = voice;
  }
  
  window.speechSynthesis.speak(utterance);
}

```

### webview/modules\70-game-rules.js
```javascript
// webview/modules/70-game-rules.js

(function() {
    const rulesBtn = document.getElementById('game-rules-settings-btn');
    const rulesPanel = document.getElementById('game-rules-panel');
    const rulesClose = document.getElementById('game-rules-panel-close');
    const rulesBackdrop = document.getElementById('game-rules-backdrop');
    const rulesSavedToast = document.getElementById('game-rules-saved');

    const inputs = {
        enableRpgMechanics: document.getElementById('gr-enable-rpg'),
        defaultMaxHp: document.getElementById('gr-default-hp'),
        defaultMaxMp: document.getElementById('gr-default-mp'),
        diceDifficulty: document.getElementById('gr-dice-diff'),
        skillCommentary: document.getElementById('gr-skill-commentary'),
        backgroundSimulation: document.getElementById('gr-bg-sim'),
        autoLorebookGrowth: document.getElementById('gr-auto-lore')
    };

    let saveTimeout = null;

    function openPanel() {
        rulesPanel.classList.remove('hidden');
        rulesPanel.setAttribute('aria-hidden', 'false');
        rulesBackdrop.classList.remove('hidden');
    }

    function closePanel() {
        rulesPanel.classList.add('hidden');
        rulesPanel.setAttribute('aria-hidden', 'true');
        rulesBackdrop.classList.add('hidden');
    }

    if (rulesBtn) rulesBtn.addEventListener('click', openPanel);
    if (rulesClose) rulesClose.addEventListener('click', closePanel);
    if (rulesBackdrop) rulesBackdrop.addEventListener('click', closePanel);

    function notifySave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        rulesSavedToast.classList.remove('hidden');
        saveTimeout = setTimeout(() => {
            rulesSavedToast.classList.add('hidden');
        }, 2000);
    }

    function triggerSave() {
        const rules = {
            enableRpgMechanics: inputs.enableRpgMechanics.checked,
            defaultMaxHp: parseInt(inputs.defaultMaxHp.value, 10) || 100,
            defaultMaxMp: parseInt(inputs.defaultMaxMp.value, 10) || 50,
            diceDifficulty: inputs.diceDifficulty.value || 'Normal',
            skillCommentary: inputs.skillCommentary.checked,
            backgroundSimulation: inputs.backgroundSimulation.checked,
            autoLorebookGrowth: inputs.autoLorebookGrowth.checked
        };
        vscode.postMessage({ type: 'updateGameRules', rules });
        notifySave();
    }

    // Bind change events
    Object.values(inputs).forEach(input => {
        if (!input) return;
        if (input.type === 'checkbox') {
            input.addEventListener('change', triggerSave);
        } else {
            input.addEventListener('change', triggerSave);
            // Auto save on blur for number/text inputs
            input.addEventListener('blur', triggerSave);
        }
    });

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'gameRules' && message.rules) {
            const rules = message.rules;
            if (rules.enableRpgMechanics !== undefined) inputs.enableRpgMechanics.checked = rules.enableRpgMechanics;
            if (rules.defaultMaxHp !== undefined) inputs.defaultMaxHp.value = rules.defaultMaxHp;
            if (rules.defaultMaxMp !== undefined) inputs.defaultMaxMp.value = rules.defaultMaxMp;
            if (rules.diceDifficulty !== undefined) inputs.diceDifficulty.value = rules.diceDifficulty;
            if (rules.skillCommentary !== undefined) inputs.skillCommentary.checked = rules.skillCommentary;
            if (rules.backgroundSimulation !== undefined) inputs.backgroundSimulation.checked = rules.backgroundSimulation;
            if (rules.autoLorebookGrowth !== undefined) inputs.autoLorebookGrowth.checked = rules.autoLorebookGrowth;
        }
    });

    // Request initial rules
    vscode.postMessage({ type: 'getGameRules' });

})();

```

### webview/modules\80-inspector.js
```javascript
/* global window, document, T */

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'promptContext') {
            renderPromptContext(message.breakdown);
        }
        if (message.type === 'gameStateUpdate') {
            if (message.turnResult) {
                renderTurnResult(message.turnResult);
            }
            if (message.schemaErrors) {
                renderSchemaErrors(message.schemaErrors);
            } else if (message.state) {
                renderSchemaErrors([]);
            }
            if (message.state) {
                renderHiddenState(message.state.hiddenState);
            }
        }
    });
});

function renderPromptContext(breakdown) {
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    const summaryDiv = document.getElementById('inspector-prompt-summary');
    const sectionsDiv = document.getElementById('inspector-prompt-sections');
    const memoryDiv = document.getElementById('inspector-memory-matches');
    const loreDiv = document.getElementById('inspector-lore-matches');

    if (!breakdown || !summaryDiv || !sectionsDiv) {
        return;
    }

    if (emptyText) {
        emptyText.classList.add('hidden');
    }
    if (content) {
        content.classList.remove('hidden');
    }

    const backend = breakdown.memoryBackend || 'auto';
    const tokens = breakdown.totalTokensEstimate ?? 0;
    const chars = breakdown.totalChars ?? 0;
    summaryDiv.textContent = typeof T === 'function'
        ? T('webview.inspector.promptSummary', {
            backend,
            tokens: String(tokens),
            chars: String(chars)
        })
        : `Backend: ${backend} · ~${tokens} tokens · ${chars} chars`;

    sectionsDiv.innerHTML = '';
    (breakdown.sections || []).forEach((section) => {
        const row = document.createElement('details');
        row.className = 'inspector-item prompt-section';
        row.innerHTML = `
            <summary><strong>${escapeHtml(section.label)}</strong>
              <span class="tag-item">~${section.tokenEstimate} tok</span>
            </summary>
            <pre class="prompt-preview">${escapeHtml(section.text)}</pre>
        `;
        sectionsDiv.appendChild(row);
    });
    if (!breakdown.sections || breakdown.sections.length === 0) {
        sectionsDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noPromptSections'))}</span>`;
    }

    if (memoryDiv) {
        memoryDiv.innerHTML = '';
        const matches = breakdown.memoryMatches || [];
        if (matches.length === 0) {
            memoryDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noMemory'))}</span>`;
        } else {
            matches.forEach((m) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                row.innerHTML = `<strong>${escapeHtml(m.label)}</strong> <span class="tag-item">${escapeHtml(m.source)}</span><br><span class="patch-value">${escapeHtml(m.preview)}</span>`;
                memoryDiv.appendChild(row);
            });
        }
    }

    if (loreDiv) {
        loreDiv.innerHTML = '';
        const lore = breakdown.matchedLore || [];
        if (lore.length === 0) {
            loreDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noLore'))}</span>`;
        } else {
            lore.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                const keys = (entry.keys || []).join(', ');
                row.innerHTML = `<strong>📖 ${escapeHtml(entry.label)}</strong>${keys ? ` <span class="tag-item">${escapeHtml(keys)}</span>` : ''}<br><span class="patch-value">${escapeHtml(entry.preview)}</span>`;
                loreDiv.appendChild(row);
            });
        }
    }
}

function renderSchemaErrors(errors) {
    const schemaDiv = document.getElementById('inspector-schema-errors');
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    if (!schemaDiv) {
        return;
    }

    if (errors && errors.length > 0) {
        if (emptyText) {
            emptyText.classList.add('hidden');
        }
        if (content) {
            content.classList.remove('hidden');
        }
        schemaDiv.innerHTML = '';
        errors.forEach((err) => {
            const row = document.createElement('div');
            row.className = 'inspector-item';
            row.style.color = 'var(--text-danger)';
            row.textContent = String(err);
            schemaDiv.appendChild(row);
        });
    } else {
        schemaDiv.innerHTML = `<span class="empty-text">${escapeHtml(typeof T === 'function' && T('webview.inspector.noSchemaErrors') ? T('webview.inspector.noSchemaErrors') : 'No schema errors')}</span>`;
    }
}

function renderHiddenState(hiddenState) {
    const hiddenStateDiv = document.getElementById('inspector-hidden-state');
    if (!hiddenStateDiv) return;
    
    if (hiddenState && Object.keys(hiddenState).length > 0) {
        hiddenStateDiv.textContent = JSON.stringify(hiddenState, null, 2);
    } else {
        hiddenStateDiv.innerHTML = `<span class="empty-text">${escapeHtml(typeof T === 'function' && T('webview.inspector.noHiddenState') ? T('webview.inspector.noHiddenState') : 'No hidden state')}</span>`;
    }
}

function renderTurnResult(turnResult) {
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    const turnIdDiv = document.getElementById('inspector-turn-id');
    const integrityDiv = document.getElementById('inspector-integrity');
    const diceLedgerDiv = document.getElementById('inspector-dice-ledger');
    const statePatchDiv = document.getElementById('inspector-state-patch');
    const lorebookDiv = document.getElementById('inspector-lorebook');

    if (!turnResult || !emptyText || !content) {
        return;
    }

    emptyText.classList.add('hidden');
    content.classList.remove('hidden');

    if (turnIdDiv) {
        turnIdDiv.innerHTML = '';
        const idSpan = document.createElement('span');
        idSpan.textContent = turnResult.turnId || '?';
        turnIdDiv.appendChild(idSpan);

        if (turnResult.turnId) {
            const branchBtn = document.createElement('button');
            branchBtn.className = 'glass-btn';
            branchBtn.style.marginLeft = '1rem';
            branchBtn.style.padding = '2px 6px';
            branchBtn.style.fontSize = '12px';
            branchBtn.textContent = '⎇ Branch Timeline';
            branchBtn.title = 'Branch timeline from this turn';
            branchBtn.onclick = () => {
                if (confirm('Create a new timeline branch starting from this turn?')) {
                    vscode.postMessage({ type: 'branchTimeline', turnId: turnResult.turnId });
                }
            };
            turnIdDiv.appendChild(branchBtn);
        }
    }

    if (integrityDiv) {
        integrityDiv.innerHTML = '';
        const rows = [];
        if (turnResult.beforeHash) {
            rows.push({ label: 'before', value: turnResult.beforeHash });
        }
        if (turnResult.afterHash) {
            rows.push({ label: 'after', value: turnResult.afterHash });
        }
        if (turnResult.appliedAt) {
            rows.push({ label: 'applied', value: turnResult.appliedAt });
        }
        if (rows.length === 0) {
            integrityDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noIntegrity'))}</span>`;
        } else {
            rows.forEach((row) => {
                const el = document.createElement('div');
                el.className = 'inspector-item';
                el.innerHTML = `<strong>${escapeHtml(row.label)}</strong> <code class="patch-value">${escapeHtml(row.value)}</code>`;
                integrityDiv.appendChild(el);
            });
        }
    }

    if (diceLedgerDiv) {
        diceLedgerDiv.innerHTML = '';
        if (turnResult.diceLedger && turnResult.diceLedger.length > 0) {
            const totalCount = turnResult.diceLedger.length;
            const visibleLedger = turnResult.diceLedger.slice(0, 30);
            visibleLedger.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                let html = `<strong>${escapeHtml(entry.formula)}</strong> ➔ <span>${entry.total}</span>`;
                if (entry.reason) {
                    html += ` <span class="tag-item">${escapeHtml(entry.reason)}</span>`;
                }
                if (entry.success !== undefined) {
                    const tag = entry.success
                        ? T('webview.inspector.success')
                        : T('webview.inspector.failure');
                    const color = entry.success ? 'var(--text-success)' : 'var(--text-danger)';
                    html += ` <span style="color:${color}">[${escapeHtml(tag)}]</span>`;
                }
                row.innerHTML = html;
                diceLedgerDiv.appendChild(row);
            });
            if (totalCount > 30) {
                const row = document.createElement('div');
                row.className = 'inspector-item empty-text';
                row.textContent = T('webview.inspector.moreRolls', { count: String(totalCount - 30) });
                diceLedgerDiv.appendChild(row);
            }
        } else {
            diceLedgerDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noDice'))}</span>`;
        }
    }

    if (statePatchDiv) {
        statePatchDiv.innerHTML = '';
        if (turnResult.statePatch && turnResult.statePatch.length > 0) {
            const totalCount = turnResult.statePatch.length;
            const visiblePatches = turnResult.statePatch.slice(0, 30);
            visiblePatches.forEach((patch) => {
                const row = document.createElement('div');
                row.className = 'inspector-item diff-item';

                let icon = '🔄';
                let color = 'var(--text-color)';
                if (patch.op === 'add') { icon = '➕'; color = 'var(--text-success)'; }
                else if (patch.op === 'remove') { icon = '➖'; color = 'var(--text-danger)'; }

                row.innerHTML = `
                    <span title="${escapeHtml(patch.op)}">${icon}</span>
                    <code style="color:${color}">${escapeHtml(patch.path)}</code>
                    ${patch.value !== undefined ? `➔ <span class="patch-value">${escapeHtml(JSON.stringify(patch.value))}</span>` : ''}
                `;
                statePatchDiv.appendChild(row);
            });
            if (totalCount > 30) {
                const row = document.createElement('div');
                row.className = 'inspector-item empty-text';
                row.textContent = T('webview.inspector.morePatches', { count: String(totalCount - 30) });
                statePatchDiv.appendChild(row);
            }
        } else {
            statePatchDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noPatch'))}</span>`;
        }
    }

    if (lorebookDiv) {
        lorebookDiv.innerHTML = '';
        if (turnResult.triggeredLore && turnResult.triggeredLore.length > 0) {
            turnResult.triggeredLore.forEach((label) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                row.innerHTML = `<span class="tag-item">📖 ${escapeHtml(label)}</span>`;
                lorebookDiv.appendChild(row);
            });
        } else {
            lorebookDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noLore'))}</span>`;
        }
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}
```

### webview/modules\81-lorebook.js
```javascript
/* global window, document, T, vscode */

let lorebookEntries = [];
let lorebookWriteFile = 'lorebook.json';
let lorebookDirty = false;
let lorebookEditingId = null;

window.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('lorebook-add-btn');
    const saveBtn = document.getElementById('lorebook-save-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addLorebookEntry());
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveLorebook());
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'lorebookList') {
            lorebookWriteFile = message.writeFile || 'lorebook.json';
            lorebookEntries = (message.entries || []).map(cloneEntry);
            lorebookDirty = false;
            lorebookEditingId = null;
            updateDirtyBadge();
            renderLorebookList(message);
        }
        if (message.type === 'lorebookSaveResult') {
            if (message.ok) {
                lorebookDirty = false;
                updateDirtyBadge();
            } else if (message.errors && message.errors.length) {
                alert(message.errors.join('\n'));
            }
        }
    });
});

function cloneEntry(entry) {
    return {
        id: entry.id,
        label: entry.label || '',
        content: entry.content || entry.contentPreview || '',
        keys: Array.isArray(entry.keys) ? [...entry.keys] : [],
        secondary_keys: Array.isArray(entry.secondary_keys) ? [...entry.secondary_keys] : [],
        contentPreview: entry.contentPreview || '',
        enabled: entry.enabled !== false,
        use_regex: entry.use_regex === true,
        priority: entry.priority ?? 0,
        insertion_order: entry.insertion_order ?? 0,
        pinned: entry.pinned === true
    };
}

function markDirty() {
    lorebookDirty = true;
    updateDirtyBadge();
}

function updateDirtyBadge() {
    const badge = document.getElementById('lorebook-dirty');
    if (!badge) {
        return;
    }
    badge.classList.toggle('hidden', !lorebookDirty);
}

function splitKeys(text) {
    return String(text || '')
        .split(/[,;\n]/)
        .map((k) => k.trim())
        .filter(Boolean);
}

function addLorebookEntry() {
    const id = `entry-${Date.now().toString(36)}`;
    const entry = {
        id,
        label: typeof T === 'function' ? T('webview.lorebook.newEntryLabel') : 'New entry',
        content: '',
        keys: [],
        secondary_keys: [],
        contentPreview: '',
        enabled: true,
        use_regex: false,
        priority: 100,
        insertion_order: 100,
        pinned: false
    };
    lorebookEntries.unshift(entry);
    lorebookEditingId = id;
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function deleteLorebookEntry(id) {
    const confirmMsg = typeof T === 'function' ? T('webview.lorebook.deleteConfirm') : 'Delete this entry?';
    if (!window.confirm(confirmMsg)) {
        return;
    }
    lorebookEntries = lorebookEntries.filter((e) => e.id !== id);
    if (lorebookEditingId === id) {
        lorebookEditingId = null;
    }
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function toggleLorebookEntry(id, enabled) {
    const entry = lorebookEntries.find((e) => e.id === id);
    if (!entry) {
        return;
    }
    entry.enabled = enabled;
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function setEditingId(id) {
    lorebookEditingId = lorebookEditingId === id ? null : id;
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function readFormIntoEntry(id) {
    const entry = lorebookEntries.find((e) => e.id === id);
    if (!entry) {
        return;
    }
    const labelEl = document.getElementById(`lore-label-${id}`);
    const keysEl = document.getElementById(`lore-keys-${id}`);
    const secEl = document.getElementById(`lore-sec-${id}`);
    const contentEl = document.getElementById(`lore-content-${id}`);
    const pinnedEl = document.getElementById(`lore-pinned-${id}`);
    const regexEl = document.getElementById(`lore-regex-${id}`);
    const prioEl = document.getElementById(`lore-prio-${id}`);
    const orderEl = document.getElementById(`lore-order-${id}`);

    if (labelEl) { entry.label = labelEl.value.trim(); }
    if (keysEl) { entry.keys = splitKeys(keysEl.value); }
    if (secEl) { entry.secondary_keys = splitKeys(secEl.value); }
    if (contentEl) {
        entry.content = contentEl.value;
        entry.contentPreview = entry.content.slice(0, 200);
    }
    if (pinnedEl) { entry.pinned = pinnedEl.checked; }
    if (regexEl) { entry.use_regex = regexEl.checked; }
    if (prioEl) { entry.priority = Number(prioEl.value) || 0; }
    if (orderEl) { entry.insertion_order = Number(orderEl.value) || 0; }
}

function saveLorebook() {
    lorebookEntries.forEach((e) => {
        if (lorebookEditingId === e.id) {
            readFormIntoEntry(e.id);
        }
    });
    vscode.postMessage({ type: 'saveLorebook', entries: lorebookEntries });
}

function renderLorebookList(payload) {
    const list = document.getElementById('lorebook-list');
    const meta = document.getElementById('lorebook-meta');
    if (!list) {
        return;
    }

    const entries = payload.entries || lorebookEntries;
    const writeFile = payload.writeFile || lorebookWriteFile;

    if (meta) {
        const count = entries.length;
        meta.textContent = typeof T === 'function'
            ? T('webview.lorebook.editorMeta', { file: writeFile, count: String(count) })
            : `${writeFile} — ${count} entries (edits save here)`;
    }

    list.innerHTML = '';
    if (entries.length === 0) {
        list.innerHTML = `<div class="empty-text">${escapeHtml(typeof T === 'function' ? T('webview.lorebook.noEntries') : 'No entries')}</div>`;
        return;
    }

    const sorted = [...entries].sort((a, b) => (b.insertion_order || 0) - (a.insertion_order || 0));
    sorted.forEach((entry) => {
        const isEditing = lorebookEditingId === entry.id;
        const card = document.createElement('div');
        card.className = 'lorebook-card inspector-item';
        card.dataset.entryId = entry.id;

        const status = entry.enabled
            ? (typeof T === 'function' ? T('webview.lorebook.enabled') : 'enabled')
            : (typeof T === 'function' ? T('webview.lorebook.disabled') : 'disabled');

        if (isEditing) {
            card.innerHTML = `
                <div class="lorebook-form">
                  <label>${escapeHtml(T('webview.lorebook.fieldLabel'))}</label>
                  <input id="lore-label-${escapeHtml(entry.id)}" type="text" value="${escapeAttr(entry.label)}" />
                  <label>${escapeHtml(T('webview.lorebook.fieldKeys'))}</label>
                  <input id="lore-keys-${escapeHtml(entry.id)}" type="text" value="${escapeAttr((entry.keys || []).join(', '))}" placeholder="keyword1, keyword2" />
                  <label>${escapeHtml(T('webview.lorebook.fieldSecondary'))}</label>
                  <input id="lore-sec-${escapeHtml(entry.id)}" type="text" value="${escapeAttr((entry.secondary_keys || []).join(', '))}" />
                  <label>${escapeHtml(T('webview.lorebook.fieldContent'))}</label>
                  <textarea id="lore-content-${escapeHtml(entry.id)}" rows="4">${escapeHtml(entry.content || '')}</textarea>
                  <div class="lorebook-form-row">
                    <label><input id="lore-pinned-${escapeHtml(entry.id)}" type="checkbox" ${entry.pinned ? 'checked' : ''} /> ${escapeHtml(typeof T === 'function' ? T('webview.lorebook.fieldPinned') : 'Pin to GM')}</label>
                    <label><input id="lore-regex-${escapeHtml(entry.id)}" type="checkbox" ${entry.use_regex ? 'checked' : ''} /> ${escapeHtml(T('webview.lorebook.fieldRegex'))}</label>
                    <label>${escapeHtml(T('webview.lorebook.fieldPriority'))} <input id="lore-prio-${escapeHtml(entry.id)}" type="number" value="${entry.priority ?? 0}" style="width:4rem" /></label>
                    <label>${escapeHtml(T('webview.lorebook.fieldOrder'))} <input id="lore-order-${escapeHtml(entry.id)}" type="number" value="${entry.insertion_order ?? 0}" style="width:4rem" /></label>
                  </div>
                  <div class="lorebook-card-actions">
                    <button type="button" class="small-btn primary lore-done-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.done'))}</button>
                    <button type="button" class="small-btn lore-delete-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.delete'))}</button>
                  </div>
                </div>
            `;
        } else {
            const keys = (entry.keys || []).join(', ');
            card.innerHTML = `
                <div class="lorebook-card-head">
                  <strong>${escapeHtml(entry.label)}</strong>
                  <span class="tag-item">${escapeHtml(status)}</span>
                  ${entry.pinned ? '<span class="tag-item">📌 pin</span>' : ''}
                  ${entry.use_regex ? '<span class="tag-item">regex</span>' : ''}
                </div>
                <div class="patch-value">${keys ? escapeHtml(keys) : '—'}</div>
                <div class="lorebook-preview">${escapeHtml(entry.contentPreview || entry.content || '')}</div>
                <div class="lorebook-card-actions">
                  <button type="button" class="small-btn lore-edit-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.edit'))}</button>
                  <button type="button" class="small-btn lore-toggle-btn" data-id="${escapeAttr(entry.id)}" data-enabled="${entry.enabled ? '0' : '1'}">${escapeHtml(entry.enabled ? (typeof T === 'function' ? T('webview.lorebook.disable') : 'Disable') : (typeof T === 'function' ? T('webview.lorebook.enable') : 'Enable'))}</button>
                  <button type="button" class="small-btn lore-delete-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.delete'))}</button>
                </div>
            `;
        }

        list.appendChild(card);
    });

    list.querySelectorAll('.lore-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => setEditingId(btn.dataset.id));
    });
    list.querySelectorAll('.lore-done-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            readFormIntoEntry(btn.dataset.id);
            markDirty();
            setEditingId(null);
        });
    });
    list.querySelectorAll('.lore-delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => deleteLorebookEntry(btn.dataset.id));
    });
    list.querySelectorAll('.lore-toggle-btn').forEach((btn) => {
        btn.addEventListener('click', () => toggleLorebookEntry(btn.dataset.id, btn.dataset.enabled === '1'));
    });
    list.querySelectorAll('input, textarea').forEach((el) => {
        el.addEventListener('input', markDirty);
        el.addEventListener('change', markDirty);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, '&#096;');
}
```

### webview/modules\82-memory.js
```javascript
/* global window, document, T, vscode */

window.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('memory-search-btn');
    const rebuildBtn = document.getElementById('memory-rebuild-btn');
    const backendSel = document.getElementById('memory-backend-select');
    const hintInput = document.getElementById('memory-hint-input');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const hint = hintInput ? hintInput.value.trim() : '';
            vscode.postMessage({ type: 'searchMemory', hint });
        });
    }
    if (rebuildBtn) {
        rebuildBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'rebuildMemoryIndex' });
        });
    }
    if (backendSel) {
        backendSel.addEventListener('change', () => {
            vscode.postMessage({ type: 'setMemoryBackend', backend: backendSel.value });
        });
    }
    if (hintInput) {
        hintInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                vscode.postMessage({ type: 'searchMemory', hint: hintInput.value.trim() });
            }
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'memoryStatus') {
            renderMemoryStatus(message.status);
        }
        if (message.type === 'memorySearchResult') {
            renderMemorySearch(message);
        }
    });
});

function renderMemoryStatus(status) {
    const meta = document.getElementById('memory-status-meta');
    const backendSel = document.getElementById('memory-backend-select');
    if (!status) {
        return;
    }
    if (backendSel && status.backend) {
        backendSel.value = status.backend;
    }
    if (meta) {
        const updated = status.indexUpdated
            ? new Date(status.indexUpdated).toLocaleString()
            : (typeof T === 'function' ? T('webview.memory.noIndex') : 'no index');
        meta.textContent = typeof T === 'function'
            ? T('webview.memory.statusMeta', {
                count: String(status.chunkCount ?? 0),
                backend: status.backend || 'auto',
                updated
            })
            : `${status.chunkCount} chunks · ${status.backend} · ${updated}`;
    }
}

function renderMemorySearch(payload) {
    const list = document.getElementById('memory-search-results');
    const budget = document.getElementById('memory-token-budget');
    if (!list) {
        return;
    }
    const matches = payload.matches || [];
    const totalTokens = matches.reduce((sum, m) => sum + (m.tokenEstimate || 0), 0);

    if (budget) {
        budget.textContent = typeof T === 'function'
            ? T('webview.memory.tokenBudget', { tokens: String(totalTokens), count: String(matches.length) })
            : `~${totalTokens} tokens (${matches.length} matches)`;
    }

    list.innerHTML = '';
    if (matches.length === 0) {
        list.innerHTML = `<div class="empty-text">${escapeHtml(typeof T === 'function' ? T('webview.memory.noMatches') : 'No matches')}</div>`;
        return;
    }

    matches.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        const score = m.score !== undefined ? `score ${m.score}` : '';
        row.innerHTML = `
            <strong>${escapeHtml(m.label)}</strong>
            <span class="tag-item">${escapeHtml(m.source)}</span>
            ${score ? `<span class="tag-item">${escapeHtml(score)}</span>` : ''}
            <span class="tag-item">~${m.tokenEstimate || 0} tok</span>
            <div class="lorebook-preview">${escapeHtml(m.preview || '')}</div>
        `;
        list.appendChild(row);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}
```

### webview/modules\83-director.js
```javascript
/* global window, document, T */

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'scenarioDirector') {
            renderScenarioDirector(message.director);
        }
    });
});

function renderScenarioDirector(director) {
    const empty = document.getElementById('director-empty');
    const content = document.getElementById('director-content');
    const liveBadge = document.getElementById('director-live-badge');
    if (!content) {
        return;
    }

    if (!director) {
        if (empty) { empty.classList.remove('hidden'); }
        content.classList.add('hidden');
        return;
    }

    if (empty) { empty.classList.add('hidden'); }
    content.classList.remove('hidden');

    if (liveBadge) {
        liveBadge.classList.toggle('hidden', !director.hasRuntimeOverrides);
    }

    setText('director-title', director.scenarioTitle || '—');
    const actLive = [director.act, director.chapter].filter(Boolean).join(' / ');
    const actTemplate = director.templateSnapshot
        ? [director.templateSnapshot.act, director.templateSnapshot.chapter].filter(Boolean).join(' / ')
        : undefined;
    setFieldWithTemplate('director-act', actLive, actTemplate);
    setFieldWithTemplate('director-scene', director.scene, director.templateSnapshot?.scene);
    setFieldWithTemplate('director-objective', director.objective, director.templateSnapshot?.objective);
    setFieldWithTemplate('director-guidance', director.guidanceMode, director.templateSnapshot?.guidanceMode);

    renderList('director-success', director.successConditions);
    renderList('director-fail', director.failConditions);
    renderEndingFlags('director-endings', director.endingFlags, director.achievedEndings || []);
    renderList('director-achieved', director.achievedEndings);
    renderList('director-encounters', director.optionalEncounters);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value || '—';
    }
}

function setFieldWithTemplate(id, live, template) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    const text = live || '—';
    const changed = template !== undefined && live !== undefined && live !== template;
    if (changed && template) {
        el.innerHTML = `${escapeHtml(text)} <span class="tag-item">${escapeHtml(typeof T === 'function' ? T('webview.director.was') : 'was')}: ${escapeHtml(template)}</span>`;
    } else {
        el.textContent = text;
    }
}

function renderList(id, items) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.innerHTML = `<span class="empty-text">—</span>`;
        return;
    }
    items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        row.textContent = item;
        el.appendChild(row);
    });
}

function renderEndingFlags(id, allFlags, achieved) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    el.innerHTML = '';
    if (!allFlags || allFlags.length === 0) {
        el.innerHTML = `<span class="empty-text">—</span>`;
        return;
    }
    const achievedSet = new Set(achieved || []);
    allFlags.forEach((flag) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        const done = achievedSet.has(flag);
        row.innerHTML = done
            ? `✅ ${escapeHtml(flag)}`
            : `○ ${escapeHtml(flag)}`;
        if (done) {
            row.style.color = 'var(--text-success)';
        }
        el.appendChild(row);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}
```

### webview/modules\84-party.js
```javascript
/* global window, document, T, vscode */

let partyDirectorDraft = null;
let partyMemberNames = {};

window.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('party-save-btn');
    const banterCb = document.getElementById('party-banter-cb');
    const quietCb = document.getElementById('party-quiet-cb');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (!partyDirectorDraft) {
                return;
            }
            vscode.postMessage({ type: 'savePartyDirector', director: partyDirectorDraft });
        });
    }
    if (banterCb) {
        banterCb.addEventListener('change', () => {
            if (partyDirectorDraft) {
                partyDirectorDraft.global.npcBanterEnabled = banterCb.checked;
                markPartyDirty(true);
            }
        });
    }
    if (quietCb) {
        quietCb.addEventListener('change', () => {
            if (partyDirectorDraft) {
                partyDirectorDraft.global.combatQuietMode = quietCb.checked;
                markPartyDirty(true);
            }
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'partyDirector') {
            renderPartyDirector(message.director);
        }
        if (message.type === 'characterList') {
            const chars = message.characters || [];
            partyMemberNames = {};
            chars.forEach((c) => {
                if (c && c.id) {
                    partyMemberNames[c.id] = c.name || c.id;
                }
            });
            if (partyDirectorDraft) {
                renderPartyMembers(partyDirectorDraft);
            }
        }
        if (message.type === 'partyDirectorSaved') {
            markPartyDirty(false);
        }
    });
});

function renderPartyDirector(director) {
    const empty = document.getElementById('party-empty');
    const content = document.getElementById('party-content');
    const liveBadge = document.getElementById('party-live-badge');
    if (!content) {
        return;
    }

    if (!director || Object.keys(director.members || {}).length === 0) {
        partyDirectorDraft = null;
        if (empty) { empty.classList.remove('hidden'); }
        content.classList.add('hidden');
        return;
    }

    partyDirectorDraft = {
        format: 'lorerelay-party-director/1.0',
        global: {
            npcBanterEnabled: director.global.npcBanterEnabled !== false,
            combatQuietMode: director.global.combatQuietMode === true
        },
        members: {}
    };
    for (const [id, m] of Object.entries(director.members)) {
        partyDirectorDraft.members[id] = {
            verbosity: m.verbosity ?? 50,
            muted: !!m.muted,
            forceSpeak: !!m.forceSpeak,
            relationships: { ...(m.relationships || {}) }
        };
    }

    if (empty) { empty.classList.add('hidden'); }
    content.classList.remove('hidden');
    if (liveBadge) {
        liveBadge.classList.toggle('hidden', !director.hasRuntimeOverrides);
    }

    const banterCb = document.getElementById('party-banter-cb');
    const quietCb = document.getElementById('party-quiet-cb');
    if (banterCb) { banterCb.checked = partyDirectorDraft.global.npcBanterEnabled; }
    if (quietCb) { quietCb.checked = partyDirectorDraft.global.combatQuietMode; }

    renderPartyMembers(director);
    markPartyDirty(false);
}

function renderPartyMembers(director) {
    const container = document.getElementById('party-members-list');
    if (!container || !partyDirectorDraft) {
        return;
    }
    container.innerHTML = '';
    const memberIds = Object.keys(director.members || {});
    const relOptions = ['neutral', 'ally', 'friend', 'rival', 'enemy', 'romance'];

    memberIds.forEach((id) => {
        const cfg = partyDirectorDraft.members[id];
        const card = document.createElement('div');
        card.className = 'party-member-card';

        const title = document.createElement('h5');
        title.textContent = partyMemberNames[id] ? `${partyMemberNames[id]} (${id})` : id;
        card.appendChild(title);

        const verbRow = document.createElement('div');
        verbRow.className = 'party-control-row';
        const verbLabel = document.createElement('label');
        verbLabel.textContent = typeof T === 'function' ? T('webview.party.verbosity') : 'Verbosity';
        const verbSlider = document.createElement('input');
        verbSlider.type = 'range';
        verbSlider.min = '0';
        verbSlider.max = '100';
        verbSlider.value = String(cfg.verbosity);
        const verbVal = document.createElement('span');
        verbVal.className = 'party-verb-val';
        verbVal.textContent = String(cfg.verbosity);
        verbSlider.addEventListener('input', () => {
            cfg.verbosity = Number(verbSlider.value);
            verbVal.textContent = verbSlider.value;
            markPartyDirty(true);
        });
        verbRow.appendChild(verbLabel);
        verbRow.appendChild(verbSlider);
        verbRow.appendChild(verbVal);
        card.appendChild(verbRow);

        const flagsRow = document.createElement('div');
        flagsRow.className = 'party-flags-row';
        flagsRow.appendChild(makePartyCheckbox(
            typeof T === 'function' ? T('webview.party.muted') : 'Muted',
            cfg.muted,
            (v) => { cfg.muted = v; markPartyDirty(true); }
        ));
        flagsRow.appendChild(makePartyCheckbox(
            typeof T === 'function' ? T('webview.party.forceSpeak') : 'Force speak',
            cfg.forceSpeak,
            (v) => { cfg.forceSpeak = v; markPartyDirty(true); }
        ));
        card.appendChild(flagsRow);

        const others = memberIds.filter((oid) => oid !== id);
        if (others.length > 0) {
            const relTitle = document.createElement('div');
            relTitle.className = 'party-rel-title';
            relTitle.textContent = typeof T === 'function' ? T('webview.party.relationships') : 'Relationships';
            card.appendChild(relTitle);
            others.forEach((otherId) => {
                const row = document.createElement('div');
                row.className = 'party-rel-row';
                const label = document.createElement('span');
                label.textContent = partyMemberNames[otherId] || otherId;
                const sel = document.createElement('select');
                relOptions.forEach((opt) => {
                    const o = document.createElement('option');
                    o.value = opt;
                    o.textContent = opt;
                    sel.appendChild(o);
                });
                sel.value = cfg.relationships[otherId] || 'neutral';
                sel.addEventListener('change', () => {
                    if (sel.value === 'neutral') {
                        delete cfg.relationships[otherId];
                    } else {
                        cfg.relationships[otherId] = sel.value;
                    }
                    markPartyDirty(true);
                });
                row.appendChild(label);
                row.appendChild(sel);
                card.appendChild(row);
            });
        }

        container.appendChild(card);
    });
}

function makePartyCheckbox(labelText, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'party-flag-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(' ' + labelText));
    return wrap;
}

function markPartyDirty(dirty) {
    const badge = document.getElementById('party-dirty-badge');
    if (badge) {
        badge.classList.toggle('hidden', !dirty);
    }
}
```

### webview/modules\90-bootstrap.js
```javascript
// ===== Initialization =====
window.addEventListener('DOMContentLoaded', () => {
  // 保存された状態を復元
  const savedState = vscode.getState();
  if (savedState) {
    messageHistory = savedState.messageHistory || [];
    galleryImages = savedState.galleryImages || [];
    currentTheme = savedState.currentTheme || 'fantasy';
    renderAllMessages();
    renderGallery();
    setTheme(currentTheme);
    if (savedState.draftText && freeInput) {
      freeInput.value = savedState.draftText;
    }
    const noteEl = document.getElementById('authors-note-input');
    if (savedState.authorsNoteText && noteEl) {
      noteEl.value = savedState.authorsNoteText;
    }
  }

  // extension に状態リクエスト
  vscode.postMessage({ type: 'requestState' });
  vscode.postMessage({ type: 'getRemotePlayStatus' });

  // 入力の変更時に状態を自動保存
  if (freeInput) {
    freeInput.addEventListener('input', saveState);
  }
  const noteEl = document.getElementById('authors-note-input');
  if (noteEl) {
    noteEl.addEventListener('input', saveState);
  }

  const sel = localeSelect();
  if (sel) {
    sel.addEventListener('change', () => {
      vscode.postMessage({ type: 'setLocale', locale: sel.value });
    });
  }

  if (savedState && messageHistory.length > 0) {
    welcomeShown = true;
  }

  // ===== TTS (Voice Narration) Initialization =====
  const ttsToggleBtn = document.getElementById('tts-toggle-btn');
  const ttsMenu = document.getElementById('tts-menu');
  const ttsEnabledCb = document.getElementById('tts-enabled-cb');
  const ttsSpeedSlider = document.getElementById('tts-speed-slider');
  const ttsVolumeSlider = document.getElementById('tts-volume-slider');
  const ttsSpeedVal = document.getElementById('tts-speed-val');
  const ttsVolumeVal = document.getElementById('tts-volume-val');

  if (savedState) {
    ttsEnabled = savedState.ttsEnabled || false;
    ttsSpeed = typeof savedState.ttsSpeed === 'number' ? savedState.ttsSpeed : 1.0;
    ttsVolume = typeof savedState.ttsVolume === 'number' ? savedState.ttsVolume : 0.8;
  }

  if (ttsEnabledCb && ttsToggleBtn) {
    ttsEnabledCb.checked = ttsEnabled;
    ttsToggleBtn.classList.toggle('active', ttsEnabled);
  }
  if (ttsSpeedSlider && ttsSpeedVal) {
    ttsSpeedSlider.value = ttsSpeed;
    ttsSpeedVal.textContent = ttsSpeed.toFixed(1) + 'x';
  }
  if (ttsVolumeSlider && ttsVolumeVal) {
    ttsVolumeSlider.value = ttsVolume;
    ttsVolumeVal.textContent = Math.round(ttsVolume * 100) + '%';
  }

  if (ttsToggleBtn && ttsMenu) {
    ttsToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ttsMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!ttsMenu.classList.contains('hidden') && !ttsMenu.contains(e.target) && e.target !== ttsToggleBtn) {
        ttsMenu.classList.add('hidden');
      }
    });
  }

  if (ttsEnabledCb && ttsToggleBtn) {
    ttsEnabledCb.addEventListener('change', () => {
      ttsEnabled = ttsEnabledCb.checked;
      ttsToggleBtn.classList.toggle('active', ttsEnabled);
      if (!ttsEnabled) {
        window.speechSynthesis?.cancel();
      }
      saveState();
    });
  }

  if (ttsSpeedSlider && ttsSpeedVal) {
    ttsSpeedSlider.addEventListener('input', () => {
      ttsSpeed = parseFloat(ttsSpeedSlider.value);
      ttsSpeedVal.textContent = ttsSpeed.toFixed(1) + 'x';
      saveState();
    });
  }

  if (ttsVolumeSlider && ttsVolumeVal) {
    ttsVolumeSlider.addEventListener('input', () => {
      ttsVolume = parseFloat(ttsVolumeSlider.value);
      ttsVolumeVal.textContent = Math.round(ttsVolume * 100) + '%';
      saveState();
    });
  }
});

// ===== Extension → Webview メッセージ受信 =====
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'gameStateUpdate') {
    applyGameState(msg.state, msg.fullHistory);
  } else if (msg.type === 'imageGenStart') {
    showImageLoading();
  } else if (msg.type === 'imageGenEnd') {
    hideImageLoading(msg.success);
  } else if (msg.type === 'mediaTrigger') {
    if (msg.bgm) { playBgmById(msg.bgm); }
    else if (msg.mood) { playBgmByMood(msg.mood); }
    if (msg.sfx) {
      const ids = Array.isArray(msg.sfx) ? msg.sfx : [msg.sfx];
      ids.forEach((id) => playSfx(id));
    }
  } else if (msg.type === 'bgmManifest') {
    setBgmManifest(msg.tracks, msg.defaultVolume, msg.enabled);
  } else if (msg.type === 'sfxManifest') {
    setSfxManifest(msg.sounds, msg.defaultVolume, msg.enabled);
  } else if (msg.type === 'gmStart' || msg.type === 'grokStart') {
    showGmLoading();
  } else if (msg.type === 'gmEnd' || msg.type === 'grokEnd') {
    hideGmLoading(msg.success);
  } else if (msg.type === 'oocMessage') {
    const oocLog = document.getElementById('ooc-log');
    if (oocLog) {
      const emptyEl = oocLog.querySelector('.empty-text');
      if (emptyEl) emptyEl.style.display = 'none';
      const div = document.createElement('div');
      div.className = 'ooc-entry';
      div.style.marginBottom = '8px';
      div.style.paddingBottom = '8px';
      div.style.borderBottom = '1px solid var(--vscode-panel-border)';
      div.textContent = msg.text;
      oocLog.appendChild(div);
      oocLog.scrollTop = oocLog.scrollHeight;
    }
  } else if (msg.type === 'characterList') {
    updateCharacterList(msg.characters, msg.activeCharacterId, msg.partyIds);
  } else if (msg.type === 'summaryUpdated') {
    if (msg.summary !== undefined) {
      document.getElementById('story-summary').value = msg.summary || '';
    }
    resetSummarizeButton();
  } else if (msg.type === 'sagaArchived') {
    resetArchiveButton();
    hideArchiveSuggest();
  } else if (msg.type === 'archiveSuggest') {
    showArchiveSuggest(msg.count, msg.threshold, msg.tier);
  } else if (msg.type === 'checkpointList') {
    checkpointMetas = msg.checkpoints || [];
    rewindTargets = msg.rewindTargets || [];
    renderCheckpointUi();
  } else if (msg.type === 'updateEntry') {
    applyEntryPatch(msg.entry);
  } else if (msg.type === 'entryEdited') {
    const msgDiv = document.getElementById(`msg-${msg.id}`);
    if (msgDiv) {
      const bodyEl = msgDiv.querySelector('.msg-body');
      if (bodyEl) { bodyEl.textContent = msg.content; }
    }
    const entry = messageHistory.find((m) => m.id === msg.id);
    if (entry) { entry.content = msg.content; }
    saveState();
  } else if (msg.type === 'entryExcludeToggled') {
    const msgDiv = document.getElementById(`msg-${msg.id}`);
    if (msgDiv) {
      msgDiv.classList.toggle('excluded', !!msg.excluded);
      const excludeBtn = msgDiv.querySelector('.msg-action-btn[data-action="exclude"]');
      if (excludeBtn) { excludeBtn.classList.toggle('active', !!msg.excluded); }
    }
    const entry = messageHistory.find((m) => m.id === msg.id);
    if (entry) { entry.excludedFromPrompt = !!msg.excluded; }
    saveState();
  } else if (msg.type === 'imageGenConfig') {
    applyImageGenConfigForm(msg.config || {});
  } else if (msg.type === 'remotePlayStatus') {
    updateRemotePlayButton(msg.status);
  } else if (msg.type === 'remoteInput') {
    if (typeof msg.text === 'string' && msg.text.trim()) {
      const entry = {
        id: `user-remote-${Date.now()}`,
        role: 'user',
        content: msg.text.trim(),
        sender: T('webview.sender.player')
      };
      messageHistory.push(entry);
      renderMessage(entry);
      scrollToBottom();
      saveState();
    }
  } else if (msg.type === 'localeBundle') {
    i18nStrings = msg.strings || {};
    currentLocale = msg.locale || 'en';
    const sel = localeSelect();
    if (sel && sel.value !== currentLocale) {
      sel.value = currentLocale;
    }
    applyI18n();
    if (currentCharacters.length > 0 || activeCharId) {
      updateCharacterList(currentCharacters, activeCharId, currentPartyIds);
    }
    // Re-render dynamic UI that depends on translations
    renderAllMessages();
    renderGallery();
    renderCheckpointUi();
    if (!welcomeShown && messageHistory.length === 0) {
      welcomeShown = true;
      addSystemMessage(T('webview.welcome'));
    }
  }
});

// ===== Resizer =====
window.addEventListener('DOMContentLoaded', () => {
  const resizer = document.getElementById('resizer');
  const statusArea = document.getElementById('status-area');
  if (!resizer || !statusArea) return;

  const savedWidth = localStorage.getItem('lorerelay.statusWidth');
  if (savedWidth) {
    statusArea.style.setProperty('--status-width', `${savedWidth}px`);
  }

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = statusArea.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const diff = startX - e.clientX;
    let newWidth = startWidth + diff;
    if (newWidth < 60) newWidth = 60;
    if (newWidth > 800) newWidth = 800;

    statusArea.style.setProperty('--status-width', `${newWidth}px`);
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      const finalWidth = statusArea.getBoundingClientRect().width;
      localStorage.setItem('lorerelay.statusWidth', finalWidth);
    }
  });
});

```

