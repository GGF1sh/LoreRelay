# NOAI-SOAK-MERCHANT-ROUTE-001

Status: VERIFYING — focused soak tests PASS; `qa:noai:quick` 3/3 PASS (route mix buy=15 sell=12 travel=23 end_day=50)
Base: `origin/main` (`34da91d`)
Branch: `task/NOAI-SOAK-MERCHANT-ROUTE-001`
Worktree: `C:\AI\Testbox\LoreRelay\wt-noai-soak-merchant-route-001`
Risk: Medium (soak runner / deterministic policy; no VSIX, no save-schema migration)

## Scope

Add a location-bound soak policy that uses the same three player actions as the Player Action Hub:

- trade only at `currentLocationId`
- travel to another listed market
- end the day (world tick only then)

Do not change `merchant_balanced` / `merchant_stress` teleport baselines.

## Out of scope

Combat spectator soak, AI analyst, Webview replay, LLM autoplay.

## Verification

- `node scripts/test_noai_soak_runner_core.js`
- `npm run qa:noai:quick`
