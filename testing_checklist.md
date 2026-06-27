# LoreRelay Manual Testing Checklist

As the feature set of LoreRelay expands, automated tests cannot cover every UI and integration edge case. Use this checklist to manually verify core functionality before releases.

## 1. Webview & UI Rendering
- [ ] **Mermaid Rendering**: Verify that markdown code blocks with `mermaid` syntax correctly render into interactive diagrams without relying on external CDNs.
- [ ] **Dynamic Resource Bars**: Verify that HP/MP (object type) and affection/reputation (numeric type) update properly and visually scale in the status gallery.
- [ ] **Game Rules Toggles**: Verify that saving Game Rules (Easy / Normal / Hard or custom presets) works and that the configuration is persisted.

## 2. Media & Image Generation
- [ ] **ComfyUI Integration**: Verify that image generation connects to the local ComfyUI API, triggers generation, and correctly pipes the result back into the chat.
- [ ] **TavernCard Imports**: Drop a SillyTavern PNG card into the UI and verify that character metadata (name, description, expressions) is extracted and saved locally.

## 3. Remote Play
- [ ] **Start/Stop Server**: Start Remote Play and verify it binds properly without exposing the entire LAN unless explicitly configured (`0.0.0.0`).
- [ ] **Player/Spectator Roles**: Open the spectator URL in a browser and verify that input is blocked. Open the player URL and verify full interaction.
- [ ] **Token Rotation**: Rotate the token and verify that existing connections are correctly dropped.

## 4. Advanced Game Master Features
- [ ] **Quest Flow & Relations Generation**: Send requests like `/mermaid questFlow` and verify the GM outputs valid Mermaid syntax that renders correctly.
- [ ] **OOC Sidekick**: Verify the out-of-character sidekick chimes in appropriately without spamming or "exploding" the chat context.
- [ ] **Party Director / Force Speak**: Select a companion character and use "Force Speak" to ensure the GM properly roleplays that specific character's response.
- [ ] **Time Travel / Checkpoints**: Use the undo/restore features (Git Time Travel) and verify that the active scenario rolls back smoothly without corruption.
- [ ] **Lorebook & Memory**: Save lorebook entries, verify they persist to disk, and trigger a memory index rebuild to ensure vector search works locally.
- [ ] **Export HTML**: Export the saga to an HTML file and verify the offline layout renders correctly.

## 5. System & Installation
- [ ] **Updater Execution**: Trigger a manual/automatic update check and verify that it parses the GitHub Releases correctly and downloads the valid VSIX.
- [ ] **Installer / PowerShell**: Test the `.bat` and `.ps1` installer scripts on a fresh machine to ensure robust directory creation and extension sideloading.
- [ ] **OpenRouter Key Migration**: Verify that the legacy plain-text API key is safely migrated into VS Code's `SecretStorage` mechanism on startup.
