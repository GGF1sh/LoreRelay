# AI ecosystem integration implementation

Base: `7632b49325491e94e3ef5992d2e5257dc1a0c1f8` (2026-09-07).
User source: Pro proposal attached as `a70817c9-283c-4b53-b918-880846a0bcf6/pasted-text-1.txt`.

The full requested sequence remains open:

1. AI-CLIENT-INTEGRATION-KIT-V1: connection UI, generated configurations, local packages,
   Host pairing and diagnosis, separate actual-client smoke evidence for Codex, Gemini CLI,
   Grok Build and Claude. Do not edit client configuration automatically.
2. MCP-RESOURCES-AND-PROMPTS-V1: public world/market/events/map resources, companion and
   diary prompts, tool fallback; preserve public projection and read-only authority.
3. MULTI-MODEL-PLAY-LAB-V1: equal fixture/information/action budgets and receipt-based
   behavioral comparison, with QA sessions separate from Player sessions.
4. REMOTE-AI-GATEWAY-V1: Streamable HTTP, pairing, short-lived authentication and scoped
   read-only access first, lifecycle revocation; no filesystem/QA leakage.
5. CHAT-NATIVE-UI / VOICE: chat state cards and voice integration through the existing
   authorized service. Provider capability and account availability require evidence.

Do not treat configuration generation, an SDK harness or a mock model as actual-client
play verification. Record unavailable environments without claiming compatibility.
No Human Play has been performed by this work.

## Current evidence

- Fresh origin/main fetched; dedicated worktree preserves existing dirty checkout.
- Initial Test Console plan at unchanged base selects no tests, as expected. Re-plan
  after implementation; IPC/authentication work is High Risk.
- Codex, Grok and Claude executables are discoverable on PATH. Gemini is not currently
  discoverable. Presence is not authentication or successful connection evidence.
- Existing adapter is stdio; separate Player and Narrator Host connections own approval.

## Implementation checkpoint (not complete)

- Added `textadventure.openAiConnection`: client and role selection feeds existing Host
  approval. Legacy entrypoints remain available. This is the first UI step, not the
  completed connection/diagnostics screen.
- Configuration generation supports Codex/Grok TOML and Claude Desktop/Code/Gemini JSON;
  selected client label is explicitly not authenticated client identity.
- Compile passed. Existing `test_player_agent_mcp.js` passed with the official SDK;
  this is regression coverage, not any vendor-client smoke.
- `test_ai_client_integration.js` passed format payload/Windows quoting checks. Actual
  TOML parser/client validation remains required.
- Command palette localization check initially caught a hardcoded title, repaired with
  four NLS bundles; check now passes. i18n key check passed.
- Build-only line-ending changes to generated Webview files were restored.
- Next: connection status/diagnostics and verified client identity metadata; client
  packages (including Claude Desktop bundle), account/environment checks and isolated
  actual-client smoke. Then complete the remaining four stages above.
- No PR, push, final suite or final review yet. Do not report integration complete.

### Continuation: Host status and plugin source

- Host-only IPC snapshots now expose waiting/approval_pending/connected/closed and
  completed response count, without reading game state or disclosing the secret.
- Added localized `textadventure.aiConnectionStatus`; tool inventory is explicitly
  distinguished from current execute authorization and successful action counts.
- Compile, `test_ai_connection_status.js` (real local IPC lifecycle), and palette gate
  passed. Existing Player MCP regression also passed after the IPC edit.
- `integrations/lorerelay-player` contains a validated Codex manifest and playing skill;
  plugin and skill validators passed. Its MCP source is intentionally empty until the
  package export implementation injects the connection. Not a finished distribution.
- Official MCPB repository confirms DXT was renamed MCPB; Claude packaging should use
  the current format: https://github.com/modelcontextprotocol/mcpb .

### Continuation: portable MCPB and MCP client metadata

- Added `build_ai_client_bundle.js` and `pack_ai_client_bundle.py`: build a fixed-role
  adapter distribution and archive without embedding runtime secrets or overwriting
  outputs. MCPB user_config requests the endpoint and sensitive secret.
- Player/Narrator archives exist in `.test-runs/bundles`; those first archives predate
  the following handshake change and must be rebuilt for final delivery.
- `test_ai_client_bundle.js` builds outside the repo and uses the official SDK against
  its bundled adapter/dependencies. Both roles passed, including after handshake edit.
- Adapter now waits for MCP initialization and forwards a bounded self-reported client
  name into the Host pairing dialog. Name is explicitly not verified identity and has
  no effect on authority. Legacy IPC hello remains compatible.
- Compile, Player MCP regression, and connection lifecycle test passed after this edit.
- Local Codex, Grok and Claude MCP help commands ran successfully. No model call or
  actual-client play smoke yet. Added installation/diagnostic instructions in
  `integrations/README.md`. Full five-stage objective is still incomplete.

### Continuation: resource/prompts and first vendor diagnostic

- Adapter exposes `lorerelay://player-view` through its existing role-specific read
  tool. Five static prompts provide planning/comparison/summary/explanation/diary
  instructions and tool fallback. No extra authority is created.
- Portable SDK test now checks resources/read, prompts/list/get, forbidden URI, and
  no Host call during prompt retrieval. Passed on both roles. Compile and Player MCP
  regression also passed. Market/map/events resources remain incomplete: public DTO
  currently has only location, turn, pacing and commerce holdings.
- Added isolated Grok diagnostic script. Three local attempts ended with code 1
  without stderr; no further identical retry is permitted before reassessment.
  Its failure catch currently omits stdout, so next inspect diagnostic JSON handling
  and Grok project config discovery before another run. Credential contents are
  cleared in finally; no model was called. No vendor success evidence yet.

### Continuation: diagnosed Grok and market resource

- Fixed nonzero-exit diagnostic capture (Grok puts JSON on stdout). Actual cause:
  project folder untrusted. Added `--trust` only for this generated fixture folder.
- Grok Build doctor now paired successfully with the Narrator adapter (no model call,
  no play smoke). Script checks target server health as well as Host pairing.
- Public view now includes existing available action projections; market-report uses
  that public estimate, omitting unavailable trade data. No independent price formula.
- Compile, production Commerce action regression and packaged SDK resource/prompt
  smoke passed. Full market-specific resource assertions still need adding.

### Continuation: geography and resource assertions

- Market resource tests now cover public estimates, disabled/unavailable market and
  authorization refusal. Passed for Player and Narrator packaged adapters.
- `world-map` and `current-region` resources use geography added to the public DTO.
  Existing normalized Fog authority selects discovered regions and published locations;
  edges to undiscovered regions are omitted. No independent discovery state exists.
- Production fixture checks verify hidden location/region/edge exclusion and byte-level
  unchanged canonical files on public reads. Compile and focused tests passed.
- Latest Test Console plan is incomplete because new integration/package paths lack
  classification. This does not justify repeated full-suite runs during development;
  final High Risk suite remains pending on the final tree.
- Still outstanding: recent-events public projection, rich rendering, companion role,
  completed client packages/real play smoke, comparison lab, gateway and chat/voice.

### Continuation: scoped events and Companion

- `recent-events` now projects unexpired, nonfuture events whose region/location/
  faction references are public. It excludes NPC-linked events pending NPC visibility
  integration, strips GM hints and raw IDs, and marks coverage explicitly. Not yet
  complete NPC event coverage.
- Added a separate Companion adapter/Host factory with read_player_view and
  query_available only. No role switching API; preview/execute/QA are rejected.
- AI Connections can select Companion; status menu can stop a selected connection.
  Bundle builder accepts Companion as a separate fixed-role artifact.
- Public event test passed for hidden region/target/NPC, expiry, GM hint exclusion and
  unchanged canonical bytes. Companion read/list, forbidden tools and disposal passed.
  Existing Player MCP regression passed. Last status-menu edit still needs compile.
- Outstanding delivery remains all unverified client smoke and package integration,
  remaining resource coverage/rendering, Play Lab, Remote Gateway, chat UI and voice.

### Continuation: Companion bundle and Codex configuration

- Packaged SDK tests now cover all three fixed roles, with Companion's exact two-tool
  list. Compile and public-event/Companion authority checks passed.
- Added `smoke_codex_config.js`: installed Codex CLI accepted generated MCP fields via
  temporary `-c` overrides without editing existing settings or launching a model.
  This is configuration evidence only, not connection or play smoke.
- The complete work is still in progress. Local checkpoint commits do not imply final
  review, full-suite verification, vendor compatibility, PR readiness or completion.

### Continuation: local Codex package and Gemini environment

- `build_codex_local_plugin.js` creates a local plugin with bundled adapter/dependencies
  and inherited connection environment keys; no secrets embedded. Keep the build
  directory at its original location after installation. Output v2 at
  `.test-runs/codex-package-v2/lorerelay-player` passed the installed plugin validator.
- Current web docs describe `mcp_servers`, but installed plugin validator accepts
  `mcpServers` only. Builder uses the locally validated form; actual plugin installation
  remains required to resolve runtime compatibility. Do not claim it is proven.
- Official Gemini CLI 0.58.0 installed in dedicated `.test-runs/client-tools`;
  session 68117 completed successfully. Its executable is
  `node_modules/@google/gemini-cli/bundle/gemini.js`, not `dist/index.js`.
  Version and MCP help ran successfully. Authentication/connection remain unverified.

- Gemini diagnostic subsequently paired successfully using `smoke_gemini_connection.js`.
  GEMINI_CLI_HOME points to the isolated home; actual settings belong in its `.gemini`
  subfolder. Its trustedFolders file trusts only the generated fixture directory.
  No user settings/auth files copied or modified; no model call or play claim.

### Continuation: Player Lab starting implementation

- Added `playerLabCore.ts` recorder/comparison: snapshots conditions, counts typed
  receipt outcomes, excludes exact resend inflation and never reports partial/unknown
  as committed. Focused `test_player_lab.js` and compile passed.
- Added `run_player_lab.js CLIENT MODEL_LABEL`: fixed merchant fixture, separate Player
  IPC, 10-operation delegation, private expiring config and sanitized report. No
  embedded model loop or QA endpoint. Syntax checked; runtime smoke still required.
- Reports stay incomplete pending evidence audit; model label is not certified model
  identity. Equal task definition, complete comparison report and actual four-model
  executions still need implementation/verification. This is not finished Play Lab.

- `test_player_lab_runner.js` passed: spawned fixture runner, connected through stdio,
  read/available/preview/execute end-day, disconnected, verified committed receipt in
  sanitized incomplete report and erased credential contents. This uses SDK, no model.
- Actual account status checked outside sandbox: Codex is logged in using ChatGPT;
  Claude Code is not logged in. Sandbox-only Codex status incorrectly appeared logged
  out due to environment access; do not use that as account evidence.

### Continuation: disconnect settlement and Codex model attempt

- Player Lab shutdown now invalidates new calls and drains accepted calls before
  writing the report or releasing the fixture. A delayed execution regression and
  the existing SDK runner smoke passed; compile passed. No full suite repeated.
- `smoke_codex_play.js` requested GPT-6 Astra / High with one end-day operation in
  an isolated fixture. The first attempt left no receipt report. After adding safe
  diagnostic categories and credential cleanup, the second attempt timed out at
  150 seconds (`client_or_pairing_failed:-1:client_timeout`). No committed operation
  or actual-model interoperability is claimed. The known native child PID was
  checked after timeout and no longer existed. Do not blindly repeat this test.
- This timeout does not invalidate the separate Codex configuration parser smoke,
  Gemini/Grok connection diagnostics, or SDK execution evidence; none substitutes
  for successful model-driven play. Remote gateway and chat-native/voice remain
  outstanding, as does final integration verification.

### Continuation: initial read-only remote path

- Added `remoteAiGateway.ts`: official SDK Streamable HTTP on loopback, one-time
  256-bit pairing code, short-lived bearer, fixed read-only role, bounded requests,
  origin/Host checks, no-store replies, and existing local adapter/Host approval.
  Host connection menu can start this preview with a supplied HTTPS tunnel origin.
- HTTP clients cannot supply campaign, role, command, path or QA authority. The
  MCP client SDK 2.0.0 was moved from dev to runtime dependencies without upgrades.
- Compile, existing Player MCP suite and new remote SDK tests passed. Tests cover
  actual local HTTP-to-stdio-to-IPC reads, replayed pairing, missing token, hostile
  Origin, missing execute tool, resources, DELETE and Host disconnect.
- Closing all stdio adapters on Host disconnect initially broke the existing typed
  pairing-denial result. Corrected to an explicit remote-supervisor environment
  option; the existing Player suite passed after repair.
- Remaining: supervised tunnel stop invalidation, actual remote app compatibility,
  expiry/overload adversarial coverage and real installed Host UI verification.
  This is an implementation preview, not REMOTE-AI-GATEWAY-V1 completion. No tunnel
  or public listener has been deployed. Final High Risk review/full suite/CI remain.

### Continuation: external tunnel reachability invalidation

- No `cloudflared` or `ngrok` command was found on the current PATH. No external
  tunnel was installed, started or published during this turn.
- Added `remoteTunnelWitness.ts` and Gateway wiring: successful instance-specific
  HTTPS reachability is required before pairing. Fresh challenges, no redirects,
  bounded body and timeout prevent stale/foreign responses from verifying a lease.
  Probes run every five seconds with a three-second timeout. Loss after connection
  revokes the Gateway permanently; a later response cannot revive it.
- Compile and focused witness/Gateway tests passed. Witness tests use a controlled
  fetch, so they prove the transition rules, not an actual external tunnel. The
  Gateway test still proves real loopback HTTP/stdio/IPC. Production HTTPS tunnel
  verification and any instantaneous tunnel-process shutdown guarantee remain
  unproven. Do not conflate bounded reachability detection with process supervision.

### Continuation: common comparison task and receipt aggregation

- Added the public `integrations/player-lab-task.md`. Runner emits that exact task
  and records its normalized-text digest. Comparisons reject missing/different task
  conditions even when fixtures match. This records the intended task, not proof
  that a model obeyed it or saw no external information.
- Added allowlisted committed trade details (side, public commodity, quantity,
  total), cash flow explicitly distinguished from profit, and
  `scripts/compare_player_lab.js` for up to four bounded JSON reports. Invalid
  receipt/trade shapes are refused; raw requests and diagnostic data are omitted.
- Compile, Player Lab aggregation tests and production fixture SDK runner plus
  comparison command passed. Actual four-model play, audited completion, public
  regional-support metrics and model evidence remain outstanding.

Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`. Do not
escalate beyond its risk tier without a concrete reason.
