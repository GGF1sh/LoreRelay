# KNOWLEDGE-OPS-001 Dictionary Activation

## Baseline

- Expected `origin/main`: `e95997acb74137edc50302d1446f18e795e36df7`
- Observed `origin/main`: `e95997acb74137edc50302d1446f18e795e36df7`
- Branch: `task/KNOWLEDGE-OPS-001-dictionary-activation`
- Audit source: `docs/ai-tasks/AI-OPS-KNOWLEDGE-AND-INTEGRATION-AUDIT.md`

## Implemented

### Knowledge Lookup CLI

Added:

```powershell
npm run knowledge -- <query>
```

The lookup searches:

- `docs/generated/symbol_registry.json`
- `docs/TERMINOLOGY_CONTRACT.md`
- `docs/EVENT_CLASSIFICATION_GLOSSARY.md`

Symbol output is compact and shows only:

- name
- kind
- boundary
- category
- `sourcePath:line`
- direction when present

The CLI supports partial case-insensitive queries and does not dump the full registry.

### Protocol Pairing

When a query matches host-webview message types, the CLI groups matches by message name and reports:

- host-to-webview senders
- webview-to-host senders
- receivers
- paired / unpaired status

This is lookup-only. No production protocol was redesigned.

### EntityKind Layer Ownership

Updated `docs/TERMINOLOGY_CONTRACT.md` with a short ownership table distinguishing:

- D1 Identity Core kinds
- World Intent kinds
- broader campaign/domain vocabulary

The document now explicitly records that `mobile_base`, `guild`, and `domain` are valid in wider World Intent / campaign-domain vocabulary but are not automatically accepted by the narrower D1 identity inventory.

### AI Usage Rules

Updated:

- `docs/AI_PROMPT_HANDOFF_POLICY.md`
- `docs/AI_INTEGRATOR_CHAT_HANDOFF.md`

Operational rules added:

- Before adding a shared helper/exported type/public webview function/reusable constant, run the knowledge lookup for the proposed name.
- Before adding/changing a host-webview message, look up the message type and check protocol pairing.
- Before adding a `textAdventure.*` config key, look up the proposed key.
- Before adding entity kinds, clock vocabulary, or cross-ledger terms, read the relevant Terminology Contract section.
- Before adding severity/event semantic reactions, read `EVENT_CLASSIFICATION_GLOSSARY.md` and look for existing `evaluate*Event` helpers.

The policy explicitly avoids requiring every AI to read the full Symbol Registry on every task.

### Symbol Registry EOL Check

Updated `scripts/generate_symbol_registry.js --check` to compare generated content after normalizing CRLF to LF.

Result:

- CRLF-only generated-file differences pass.
- Real content drift still fails.
- No generator rewrite loop is required for Windows EOL-only noise.

## Changed Files

- `docs/AI_INTEGRATOR_CHAT_HANDOFF.md`
- `docs/AI_PROMPT_HANDOFF_POLICY.md`
- `docs/TERMINOLOGY_CONTRACT.md`
- `docs/ai-tasks/KNOWLEDGE-OPS-001-DICTIONARY-ACTIVATION.md`
- `package.json`
- `scripts/generate_symbol_registry.js`
- `scripts/knowledge_lookup.js`
- `scripts/run_all_tests.js`
- `scripts/test_knowledge_lookup.js`
- `scripts/test_symbol_registry.js`

Generated files after compile/test had EOL-only dirt and were not included as real content changes:

- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `webview/script.js`
- `webview/style.css`

## Tests

Commands:

```powershell
npm run compile
node scripts/test_symbol_registry.js
node scripts/test_knowledge_lookup.js
npm run knowledge -- textAdventure.antigravityRelay.enabled
npm test
```

Results:

- `npm run compile`: PASS
- `node scripts/test_symbol_registry.js`: PASS
- `node scripts/test_knowledge_lookup.js`: PASS
- `npm run knowledge -- textAdventure.antigravityRelay.enabled`: PASS
- `npm test`: PASS, `233/233`

Focused test coverage:

- exact symbol lookup
- partial query lookup
- protocol pairing output
- config key lookup
- terminology text lookup
- no-result behavior
- compact output
- CRLF-only Symbol Registry check passes
- real Symbol Registry content difference fails

## Final Verdict

KNOWLEDGE_OPS_001_READY_FOR_VERIFY
