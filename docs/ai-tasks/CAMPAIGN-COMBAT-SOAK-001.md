# CAMPAIGN-COMBAT-SOAK-001

Status: VERIFYING — unit + `qa:combat:quick` 3/3 PASS (204ms)
Base: `origin/main` (`c2ebff5`)
Branch: `task/CAMPAIGN-COMBAT-SOAK-001`
Risk: Medium (opt-in soak over existing campaign combat cores; no VSIX)

## Scope

Headless spectator soak of the **story combat vertical**, not Combat Lab golden-master reruns:

```
encounterOps start_combat
→ spectator / no player commands
→ terminal
→ PENDING receipt
→ applyAllPending exactly once
→ HP + combatBattleHistory
→ consequence ACK applied then alreadySatisfied
→ reload apply already_applied
```

## Out of scope

Inspector report UI (S3), Combat Lab 100-run balance, LLM autoplay.
