---
name: lorerelay-play
description: Read a connected LoreRelay campaign and use its explicitly delegated Commerce actions.
---

Use the LoreRelay MCP tools already connected to this client. If unavailable, ask the
user to open LoreRelay's AI Connections command, configure the client with its generated
settings, and approve the session in the Host. Never inspect configuration secrets or
campaign files as a substitute for a connection.

1. Read `read_player_view` and `query_available`. Reason from their public results only.
2. Explain useful available choices for the user's stated goal. Waiting, observation,
   profitable trade and helping a region are all valid goals; do not invent a preference.
3. For an authorized action, obtain a fresh `preview` with its normalized parameters.
4. Check the quote and current delegation. Use the returned opaque confirmation with
   the exact action/parameters and a fresh request ID for `execute`.
5. Report the typed receipt. Use `wait_receipt` for the same request ID when needed.

Never automatically retry `partial` or `outcome_unknown` as a new request. Do not treat
busy, stale or rejected results as success. A stale quote requires a fresh preview and
reconsideration. Respect Host refusal, expiry and action limits. Do not attempt to
create authority or to call other game actions via shell, filesystem or QA endpoints.

If connected as Narrator, use only `read_committed_facts` for summaries or diaries.
Separate invented narrative from committed facts. Never claim a narrated event changed
the game. Keep QA analysis and Player play in separate sessions.
