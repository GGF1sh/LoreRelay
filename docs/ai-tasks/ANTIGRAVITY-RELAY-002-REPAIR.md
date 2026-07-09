# ANTIGRAVITY-RELAY-002 Repair

## Inputs

- Current main: `cc15320fce9ebc7a5b44ad1d7adfb9c534ac8982`
- Candidate base: `33e652b690360f889d6543515846fb5afe07a9b4`
- Independent review: `cf9f3b43d42bbd0793d11c94e31998def8a98d9e`
- Repair branch: `task/ANTIGRAVITY-RELAY-002-repair`

## Repairs

1. Versioned the GM skill source inside LoreRelay:
   - Added repo-owned distributable source at `antigravity-skill/text-adventure-gm/`.
   - Updated `scripts/install_antigravity_skill.ps1` to install from that repo-owned source.
   - Did not copy `scenarios-r18-private/`.

2. Cleared stale Relay requests:
   - Added shared host helpers in `src/antigravityRelayBridgeHost.ts`.
   - Relay OFF clears pending request files.
   - Scenario loads, quickstart, and Parlor/In-World/session transitions clear pending request files.
   - Ordinary turn-result validation/state synchronization does not clear an active pending request.
   - Accepted matching results still clear only the matching current requestId.

3. Made workspace identity explicit:
   - Request files now include `workspacePath` and `workspaceIdentity`.
   - Clipboard fallback payload carries the same workspace identity.
   - Repo-owned skill instructions require using the request workspace contract and not an ambiguous active/current directory.
   - Relay Mode still fails clearly when no LoreRelay workspace is open.

4. Added visible Relay Mode control:
   - Added a normal header toggle button.
   - Toggle updates the real `textAdventure.antigravityRelay.enabled` setting through the webview handler.
   - ON text clearly says `Antigravity Relay ON`.
   - Banner/title instructions state: LoreRelay action, right-side `/text-adventure-gm`, same request, no automatic chat injection.

## Tests

- `npm run compile`: PASS
- `node scripts/test_antigravity_file_bridge.js`: PASS
- `node scripts/test_antigravity_relay_core.js`: PASS
- `node scripts/check_i18n_keys.js`: PASS
- `npm run check:symbol-registry`: PASS
- `node scripts/test_playtest_unblock_001.js`: PASS after fixing the fake-DOM `setAttribute` compatibility guard
- `npm test`: PASS, `231/231`

## Notes

- Initial full-suite run failed `test_playtest_unblock_001.js` because the headless fake DOM button lacked `setAttribute`; repaired with a defensive guard while preserving real DOM `aria-pressed`.
- `git diff --check` reports only Windows LF-to-CRLF warnings.
- Existing untracked `.claude/` remains untouched.
- Installed local Gemini skill was synced from the repo-owned source for this machine; the durable source of truth is now the LoreRelay repo path.

## Final Verdict

ANTIGRAVITY_RELAY_002_REPAIR_READY_FOR_VERIFY
