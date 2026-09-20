# LoreRelay Test Console

The Test Console is the standard focused-test entrypoint. It derives an evidence plan from the actual base, head, and changed files; it does not override the verification risk tier.

```powershell
# Generate and inspect a plan before manually enumerating tests.
npm run test:plan -- --base origin/main --head HEAD --mode verify

# Execute the emitted plan after checking its selected tests and reasons.
npm run test:run -- --plan <plan.json>
```

Use `npm run test:console:self` for the Console implementation. Use `npm run test:console` or `LoreRelay_Test_Console.bat` to open the same localhost dashboard. Add focused coverage only for changed behavior that the inspected plan does not include. Full-suite, human-play, and independent-review decisions remain governed by `docs/DEVELOPMENT_VERIFICATION_POLICY.md`.
