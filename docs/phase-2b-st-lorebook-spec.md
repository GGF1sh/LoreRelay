# Phase 2B SillyTavern Lorebook Compatibility Spec

This document specifies the matching engine rules and schema mapping required to support SillyTavern (ST) World Info / Lorebooks inside the LoreRelay engine. This specification will guide the implementation of the matching engine in `src/gmPromptBuilder.ts`.

---

## 1. SillyTavern Lorebook Schema Overview

When a user imports a SillyTavern Lorebook (`world_info.json`), it contains an `entries` collection. Each entry has settings determining when and how it is injected into the AI context.

### Essential Fields for Import:
- `keys`: Array of strings (or a comma-separated list) of primary triggers.
- `secondary_keys`: Array of secondary strings (all primary and secondary keys must match to activate, depending on logical modes).
- `content`: The text content to insert.
- `comment`: Human-readable label/notes.
- `id`: Unique identifier.
- `enabled`: Boolean to quickly toggle entries.
- `insertion_order`: Priority index (lower numbers or higher numbers determine insertion order).
- `use_regex`: Boolean indicating if `keys` should be interpreted as regular expressions.

---

## 2. Match Engine Features: Gap Analysis

| Feature | SillyTavern Specification | Current LoreRelay Status (v0.3.2) | Target Status (Phase 2B MVP) |
| :--- | :--- | :--- | :--- |
| **Substring Match** | Case-insensitive substring matching. | **Supported** (Uses `matchLorebookEntries` with plain includes check). | **Supported** (Refined). |
| **Regex Keys** | Evaluates keys as regexes if `use_regex` is true. | Not supported. | **Supported** (MVP). Translates ST keys to Javascript RegExp objects safely. |
| **Priority / Insertion Order** | Orders active entries so high-priority lore is closer to the bottom/top of context. | Not supported (Uses default array order). | **Supported** (MVP). Sorts entries by `insertion_order` before building prompt. |
| **Secondary Keys (AND logic)** | Requires at least one primary key AND all/some secondary keys to be present. | Not supported. | **Supported** (MVP / Phase 2B). Entry triggers only if (any `keys` match) AND (any/all `secondary_keys` match). |
| **Scan Depth** | Controls how many recent turns/characters of history are scanned for triggers. | Scans only the current player action and latest narrative. | **Supported** (MVP). Scans recent conversation window (e.g., last 3 turns). |

---

## 3. Detailed Matching Rules for Lorebook Engine

### A. Priority-based Sorting
When multiple lorebook entries trigger, they must be formatted and appended based on `insertion_order`:
- We sort triggered entries ascending/descending depending on the engine setup. Usually, lower insertion order indices are placed first in the final prompt context.

### B. Regex Evaluation
If `use_regex` is `true`:
- Compile the string in `keys` into a safe `RegExp` (e.g., `/pattern/i`).
- Wrap in `try-catch` to prevent malformed regex inputs from crashing the parser.
- Perform `regex.test(contextText)`.

### C. Secondary Keys Logic (AND Logic)
- **Primary condition:** At least one of the primary `keys` matches the scanned context.
- **Secondary condition:** If `secondary_keys` is not empty, check if the secondary keys are also present in the scanned context. If they are not found, the entry is not activated.

---

## 4. Proposed Implementation Steps (MVP)

1. **Schema Definition Update:**
   Update `src/types/GameState.ts` (or the relevant schema file) to accept imported ST fields inside `LorebookEntry`.

2. **Refactoring `matchLorebookEntries` in `src/gmPromptBuilder.ts`:**
   - Modify the signature to inspect the last $N$ turns of history (Scan Depth).
   - Implement the primary/secondary matching checks.
   - Implement the regex parser fallback.
   - Apply sorting by `insertion_order`.

3. **Validation & Test Cases:**
   Create `scripts/test_lorebook.js` validating:
   - Plain substring triggers.
   - Regex triggers.
   - Secondary key combinations.
   - Ordering correctness.
