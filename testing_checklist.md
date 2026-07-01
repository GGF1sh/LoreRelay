# LoreRelay Manual Testing Checklist

As the feature set of LoreRelay expands, automated tests cannot cover every UI and integration edge case. Use this checklist to manually verify core functionality before releases.

## 1. Webview & UI Rendering
- [ ] **Mermaid Rendering**: Verify that markdown code blocks with `mermaid` syntax correctly render into interactive diagrams without relying on external CDNs.
- [ ] **Dynamic Resource Bars**: Verify that HP/MP (object type) and affection/reputation (numeric type) update properly and visually scale in the status gallery.
- [ ] **Game Rules Toggles**: Verify that saving Game Rules (Easy / Normal / Hard or custom presets) works and that the configuration is persisted.
- [ ] **Rewind confirmation**: Click 🔱 on a past chat entry and, separately, use the input-bar rewind dropdown+button. Verify a native "Rewind history..." modal actually appears both times and Cancel truly cancels.
- [ ] **Git branch confirmation**: Click ⎇ on a chat entry and, separately, "⎇ Branch Timeline" in the Inspector. Verify a native "Create an alternate timeline branch..." modal appears both times.
- [ ] **Checkpoint label**: Click "Save Checkpoint" (input bar and quick-reply). Verify a native input box asks for a label, and the typed label actually shows up in the checkpoint list (not just "Turn N").
- [ ] **Lorebook delete**: Delete a lorebook entry and verify an in-page confirm popup appears (not a native dialog) before it's removed from the draft list.
- [ ] **Quickstart empty prompt**: Open Quickstart, leave the prompt blank, click Start. Verify the textarea shows a visible invalid/red-border state instead of doing nothing.
- [ ] **First turn in a brand-new empty workspace**: Open a fresh empty folder, send the very first player action. Verify the GM's reply actually appears as a chat message (not just in the "LoreRelay: GM Bridge" Output channel) without needing to resend. Repeat a few times across different fresh folders if possible, since the underlying bug (`onDidCreate` not always firing for a file's first-ever write) was intermittent.
- [ ] **Stuck turn_result.json recovery**: If a turn ever again shows in the Output channel but not the chat, verify that "Developer: Reload Window" alone (no manual file deletion) recovers it — `startGameStateWatcher()` now sweeps for an unprocessed `turn_result.json` on startup.
- [ ] **No duplicate send on fast submit**: Rapidly press Enter twice (or double-click Send / an Options button) right as a turn is submitted. Verify only one player message appears and input visibly locks immediately, not after a delay.

## 2. Media & Image Generation
- [ ] **ComfyUI Integration**: Verify that image generation connects to the local ComfyUI API, triggers generation, and correctly pipes the result back into the chat.
- [ ] **TavernCard Imports**: Drop a SillyTavern PNG card into the UI and verify that character metadata (name, description, expressions) is extracted and saved locally.

## 3. Remote Play
- [ ] **Start/Stop Server**: Start Remote Play and verify it binds properly without exposing the entire LAN unless explicitly configured (`0.0.0.0`).
- [ ] **Player/Spectator Roles**: Open the spectator URL in a browser and verify that input is blocked. Open the player URL and verify full interaction.
- [ ] **Token Rotation**: Rotate the token and verify that existing connections are correctly dropped.

## 4. Quest Board (Phase 8)
- [ ] **Quest Hook generation**: Run emergent simulation (advance world turn) with `recentChanges` containing a warning/critical event. Verify `world_state.json` gains a new `questHooks` entry with `source: "event"`.
- [ ] **NPC urgent need hook**: Add an NPC need with `urgency >= 70` in `npc_registry.json`, run simulation, and verify a `source: "npc"` quest appears on the Quest Board.
- [ ] **Accept quest**: Click **Accept Quest** on an available hook. Verify status becomes `active` in `world_state.json` and the World tab shows the active badge.
- [ ] **GM prompt injection**: With an active quest, open Turn Inspector preview and confirm `[Active Quest]` appears in the assembled GM prompt.
- [ ] **Quest completion**: Put the active quest id in `turn_result.json` `resolvedQuests`, apply the turn, and verify the hook status becomes `completed`.
- [ ] **i18n**: Switch locale (ja / en / zh-CN / zh-TW) and verify Quest Board title, empty state, Accept button, and ACTIVE badge translate correctly.

## 5. Agentic GM E2E (Phase 9)
- [ ] **Grok provider**: Set `textAdventure.gmBridge.provider = grok` and `textAdventure.gmBridge.agentic.enabled = true`, send one player action, and verify Output Channel shows State Referee -> Narrator -> final write.
- [ ] **VS Code LM provider**: Set `textAdventure.gmBridge.provider = vscode-lm`, choose an available model, enable agentic mode, send one player action, and verify stdout JSON fallback is parsed into `.text-adventure/agentic/referee_result.json` and `narrator_result.json`.
- [ ] **Local API provider**: Run one of `ollama`, `koboldcpp`, or `openrouter` with `agentic_stage_gm.py` available via `textAdventure.skillPath` / `gmBridge.scriptPath`, then verify the same two-stage flow succeeds.
- [ ] **Final write boundary**: For each tested provider, confirm stage files are written under `.text-adventure/agentic/`, but only the merged result writes workspace root `turn_result.json`.
- [ ] **No direct state write**: Confirm `game_state.json` changes only after LoreRelay processes the final `turn_result.json`; stage execution must not directly mutate `game_state.json`.
- [ ] **Fallback path**: Temporarily break the Narrator stage or force a timeout and verify the Referee result is preserved with fallback narration. Temporarily break Referee and verify it falls back to single-stage only when `textAdventure.gmBridge.agentic.fallbackToSingleStage = true`.
- [ ] **Busy / cancel cleanup**: Start an agentic turn, cancel/kill the GM bridge, and verify the UI leaves the busy state and a second turn can be submitted.

## 6. Advanced Game Master Features
- [ ] **Quest Flow & Relations Generation**: Send requests like `/mermaid questFlow` and verify the GM outputs valid Mermaid syntax that renders correctly.
- [ ] **OOC Sidekick**: Verify the out-of-character sidekick chimes in appropriately without spamming or "exploding" the chat context.
- [ ] **Party Director / Force Speak**: Select a companion character and use "Force Speak" to ensure the GM properly roleplays that specific character's response.
- [ ] **Time Travel / Checkpoints**: Use the undo/restore features (Git Time Travel) and verify that the active scenario rolls back smoothly without corruption.
- [ ] **Lorebook & Memory**: Save lorebook entries, verify they persist to disk, and trigger a memory index rebuild to ensure vector search works locally.
- [ ] **Export HTML**: Export the saga to an HTML file and verify the offline layout renders correctly.

## 7. NPC Voice / Adaptive TTS (Phase 11A)
- [ ] **Registry voice field**: Add a `voice` block to an NPC in `npc_registry.json` (e.g. `rate`, `pitch`, `label`, `moodAdaptive: true`). Reload World tab and verify the NPC card shows the voice label and **🔊 Preview** button.
- [ ] **World Preview**: Click Preview on a voiced NPC. Verify Web Speech API speaks the localized sample line (`webview.world.npcVoiceSample`) with the profile rate/pitch.
- [ ] **Mood adaptive**: Set `moodAdaptive: true` and change the NPC disposition mood (e.g. `sad` vs `excited`). Preview again and confirm rate/pitch shift subtly.
- [ ] **Chat 📢 attribution**: Send a GM turn whose `turn_result.json` entry has `sender` matching a unique NPC name. Click 📢 and confirm NPC voice overrides global TTS.
- [ ] **Duplicate name guard**: Create two NPCs with the same `name` at different `locationId`s without being at `currentLocationId`. Click 📢 on a message with that sender — verify global TTS is used (no wrong voice guess).
- [ ] **Location disambiguation**: Stand at one location with duplicate names; verify 📢 uses the NPC at `currentLocationId` when sender matches.
- [ ] **External/local fallback**: Set `voice.provider` to `external` or `local` with `textAdventure.tts.external.enabled = false`. Preview or 📢 — verify system TTS still speaks and devtools console shows one-time fallback warning.
- [ ] **NPC voice count**: With at least one voiced NPC, verify the TTS panel shows `NPC voices: N` (or localized equivalent).

## 8. TTS Bridge (Phase 11B)
- [ ] **Local edge-tts**: `pip install edge-tts`, ensure `TextAdventureGMSkill/scripts/tts_local.py` resolves. Set NPC `voice.provider` to `local`, World Preview or 📢 — verify MP3 plays (not Web Speech default).
- [ ] **Test Local TTS command**: Run **LoreRelay: Test Local TTS** — Output Channel `LoreRelay: TTS` shows success; Webview plays sample audio.
- [ ] **Local fallback**: Uninstall edge-tts or break `tts.local.command` — verify 📢 still speaks via system TTS.
- [ ] **OpenAI external**: Set `textAdventure.tts.external.enabled=true`, `tts.external.provider=openai`, run **Set TTS API Key**. NPC `voice.provider=external` — verify network TTS plays.
- [ ] **External privacy**: Confirm only speak text chunk is sent (not full game_state / npc memories). API key only in SecretStorage.
- [ ] **speakerNpcId**: Put `speakerNpcId` + `sender` in `turn_result.json` `gmEntry`, apply turn — verify 📢 uses that NPC voice even when sender name is ambiguous.

## 9a. Character Creator (Full Editor)
- [ ] **Locale coverage**: Open the Full Editor (✏️ Full Editor), switch the app locale to 日本語/繁體中文/简体中文, reopen it, and verify every label/placeholder/button now renders translated (previously the whole modal stayed in English).
- [ ] **Delete character**: Select an existing character in the Character Profile pane, click 🗑 Delete, confirm the dialog, and verify the character disappears from the dropdown, its `characters/{id}.json` (and any portrait/expression files) are gone from disk, and it's removed from the active party if it was a member.
- [ ] **Delete active character**: Delete the currently-active character and verify `active_character.txt` is cleared (no stale reference left behind) and the dropdown falls back to `-- New Character --` or another character cleanly.

## 9. System & Installation
- [ ] **Updater Execution**: Trigger a manual/automatic update check and verify that it parses the GitHub Releases correctly and downloads the valid VSIX.
- [ ] **Installer / PowerShell**: Test the `.bat` and `.ps1` installer scripts on a fresh machine to ensure robust directory creation and extension sideloading.
- [ ] **OpenRouter Key Migration**: Verify that the legacy plain-text API key is safely migrated into VS Code's `SecretStorage` mechanism on startup.
