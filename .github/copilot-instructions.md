# Copilot Instructions — LLM Air Traffic Simulation

Trust these instructions. They are validated and complete. Only search the codebase if information here is missing or proven incorrect.

## What This Repository Is

A browser-based airport simulation for benchmarking LLMs on real-time, safety-critical air traffic control (ATC) decisions. Aircraft spawn, land, taxi, refuel, and depart through an 11-state lifecycle while an AI controller (rule-based baseline or an LLM provider) makes routing, runway, and emergency decisions.

- **Type:** Small client-side web app (~30 source files, vanilla ES modules).
- **Language/runtime:** Plain JavaScript (no TypeScript), 4-space indent, named exports for classes. Runs directly in the browser via `<script type="module">`.
- **Tests:** Vitest, run in plain Node (no DOM).
- **Only npm dependency:** `vitest` (dev-only). There is **no** framework, bundler, or runtime dependency.

## Critical: No Build Step

This is vanilla ES modules — **no bundler, no transpiler, no framework**. Do **not** introduce a build tool, framework, or runtime dependency. Browser code must run as-is. There is no `build`, `lint`, or `start` npm script — only test scripts exist (see below).

## Environment & Tooling

- **CI uses Node 20** (`.github/workflows/test.yml`). Local validation succeeds on Node 18.19.1 / npm 9.2.0 as well. Prefer Node 20 to match CI.
- `node_modules/` is git-ignored. **Always run `npm ci` (or `npm install`) before running tests in a clean checkout.** CI uses `npm ci`.

## Build / Validate / Run Commands (all validated)

Run all commands from the repository root.

### Install dependencies (always first in a clean checkout)
```bash
npm ci
```
`npm ci` requires `package-lock.json` (present) and installs exactly the locked `vitest`. Use `npm install` if you intentionally change dependencies.

### Run the test suite (this is the CI gate)
```bash
npm test                  # vitest run — all 250 tests, ~2s
npm run test:unit         # tests/unit only
npm run test:integration  # tests/integration only
npm run test:watch        # watch mode (do not use in automated runs; it never exits)
```
- **Expected result:** `Test Files 13 passed (13)`, `Tests 250 passed (250)`, total duration ~1.5–2s.
- **Expected non-error stderr noise:** Lines like `[LLM] Failed to parse response: Unexpected end of JSON input`, `[Config] Failed to load config.yaml, using defaults: Error: no network in tests`, and other `[Config]`/`[LLM]` logs are **intentional test output** asserting error-handling paths. They do **not** indicate failure. Trust the final `Tests NNN passed` summary, not the stderr.

### Run the app (manual/visual only — not needed for code changes or CI)
```bash
python3 -m http.server 3000   # then open http://localhost:3000
```
A local HTTP server is **required** — the app uses `fetch()` to load `config.yaml` and relies on ES module resolution. Opening `index.html` via `file://` will not work. The simulation auto-starts.

### After making any code change
Always add or update the corresponding tests for any behavior you change or add (see Testing Rules below), then always run `npm test` and keep the suite green before finishing. There is no separate lint or type-check step to run.

## Testing Rules (read `tests/AGENTS.md` before substantial test work)

- Tests run in **plain Node — no jsdom/DOM**. Do **not** add `jsdom` or `happy-dom`.
- `Config` is globally mocked in [tests/setup.js](../tests/setup.js) (mirrors `Config._getDefaults()`). It is auto-loaded via `setupFiles` in `vitest.config.js`. You do not mock Config per-test; for custom values use `Config.set(path, value)` and `Config.clearOverrides()` in `beforeEach`.
- Use factories in [tests/helpers/testFactories.js](../tests/helpers/testFactories.js) (`createAircraft`, `createStateManager`, `createSnapshot`, `advanceToState`, etc.) instead of constructing fixtures by hand. The Aircraft state machine is strict — use `advanceToState()` rather than setting `ac.state` directly.
- **Not tested (do not add tests for):** `js/rendering/Renderer.js` and `js/ui/ControlPanel.js` (DOM/Canvas), and the LLM provider `fetch` wrappers (`OpenAIProvider`, `AnthropicProvider`, `GeminiProvider`, `OllamaProvider`, `AzureAIProvider`). Provider shared logic is covered via `tests/unit/AI.test.js`.
- One unit test file per source module (exceptions: `AI.test.js` covers `LLMAdapter` + `RuleBasedAI`; `Logging.test.js` covers all three logging modules).
- `SimulationEngine._tick()` uses `requestAnimationFrame`/`performance.now()` (unavailable in Node) and is not tested directly — test individual methods instead.
- **Always review and, if needed, update [tests/AGENTS.md](../tests/AGENTS.md) whenever you change the tests** (e.g. test count, directory structure, factories, conventions, or what is/isn't tested) so it stays accurate.

## Architecture Conventions (follow these when editing)

- **Entry point:** [js/main.js](../js/main.js) bootstraps `Config` → `SimulationEngine` → `Renderer` → `ControlPanel`.
- **Event-driven:** Components extend `EventEmitter` (in [js/utils/helpers.js](../js/utils/helpers.js)) and communicate via `.emit()` / `.on()`, not direct calls. Wire new cross-component behavior through events in `SimulationEngine._setupEventListeners()`, not by reaching into other modules.
- **Config singleton:** [js/utils/Config.js](../js/utils/Config.js) is a default-exported singleton. Read with `Config.get('dotted.path', fallback)`. All tunable parameters live in [config.yaml](../config.yaml) — add new constants there **and** add a matching default in `Config._getDefaults()`. Never hardcode tunables.
- **AI providers:** Every controller extends `LLMAdapter` ([js/ai/LLMAdapter.js](../js/ai/LLMAdapter.js)) and implements `async getDecisions(simulationState)`. Shared prompt-building and JSON-parsing live in the base class; provider subclasses are thin `fetch()` wrappers. `RuleBasedAI` is the deterministic, no-API-key baseline.
- **Aircraft state machine:** [js/models/Aircraft.js](../js/models/Aircraft.js) enforces 11 strict states (`APPROACHING → HOLDING_AIR → LANDING → LANDED → TAXIING_TO_GATE → AT_GATE → TAXIING_TO_RUNWAY → HOLDING_GROUND → TAKEOFF → DEPARTING → REMOVED`). Never set `ac.state` directly to skip transitions — use the model's transition methods.
- **Secrets:** API keys live only in browser `localStorage` and are sent only to their provider's endpoint. Never log, persist elsewhere, or hardcode keys.
- **Style:** File-header banner comment (`// ===== ModuleName — purpose =====`) at the top of each source file; prefixed console logs per component, e.g. `[Main]`, `[Config]`.

## Project Layout

Repository root files:
- `README.md` — full feature/architecture overview.
- `AGENTS.md` — agent guide (mirrors much of this file); `tests/AGENTS.md` — test-specific rules.
- `index.html` — single-page app shell; `config.yaml` — simulation configuration (YAML).
- `package.json` — scripts + `vitest` devDependency; `package-lock.json` — lockfile for `npm ci`.
- `vitest.config.js` — Vitest config (`environment: 'node'`, `globals: true`, `include: tests/**/*.test.js`, `setupFiles: tests/setup.js`).
- `css/index.css` — styles. `.gitignore` ignores `node_modules/`, `outputs/`, `.venv/`, `.env`.
- `outputs/` is git-ignored generated analysis artifacts — do not edit or rely on it.

`js/` source layout:
- `js/main.js` — bootstrap.
- `js/engine/` — `SimulationEngine.js`, `FlightScheduler.js`, `CollisionSystem.js`, `FuelSystem.js`, `StateManager.js`.
- `js/models/` — `Aircraft.js`.
- `js/ai/` — `LLMAdapter.js`, `RuleBasedAI.js`, and provider wrappers.
- `js/logging/` — `DecisionLogger.js`, `CrashAnalyzer.js`, `PerformanceTracker.js`.
- `js/rendering/` — `Renderer.js`. `js/ui/` — `ControlPanel.js`. `js/utils/` — `Config.js`, `helpers.js`.

`tests/` layout: `setup.js`, `helpers/testFactories.js`, `unit/*.test.js` (one per module), `integration/*.test.js` (pipeline-named).

## Pre-Check-In Validation (what CI runs)

The only CI workflow is [.github/workflows/test.yml](workflows/test.yml), triggered on pull requests to any branch. It runs on `ubuntu-latest` with Node 20:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node 20, npm cache)
3. `npm ci`
4. `npm test`

To replicate locally before opening a PR: `npm ci && npm test`. A PR will be rejected if `npm test` does not pass. Always reproduce this sequence locally and confirm `Tests 250 passed` (or higher if you added tests) before finishing.
