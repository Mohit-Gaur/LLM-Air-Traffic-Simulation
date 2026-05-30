# Tests Directory — Agent Guidelines

## Overview

This directory contains the Vitest test suite for the LLM Air Traffic Simulation backend. Tests cover all engine logic, AI decision-making, logging, models, and utility functions. **No UI/rendering tests exist here** — the `Renderer.js` and `ControlPanel.js` modules are excluded by design.

## Running Tests

```bash
npm test                  # Run all tests (vitest run)
npm run test:watch        # Watch mode
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
```

All 251 tests should pass. Total runtime target is under 10 seconds.

## Directory Structure

```
tests/
├── AGENTS.md                  # This file
├── setup.js                   # Global test setup (Config mock)
├── helpers/
│   └── testFactories.js       # Factory functions for test fixtures
├── unit/                      # Isolated module tests
│   ├── helpers.test.js
│   ├── Config.test.js
│   ├── Aircraft.test.js
│   ├── StateManager.test.js
│   ├── CollisionSystem.test.js
│   ├── FuelSystem.test.js
│   ├── FlightScheduler.test.js
│   ├── SimulationEngine.test.js
│   ├── AI.test.js
│   └── Logging.test.js
└── integration/               # Cross-module interaction tests
    ├── aircraft-lifecycle.test.js
    ├── fuel-crash-pipeline.test.js
    └── ai-decision-flow.test.js
```

## Critical: Config Mock

The `Config` singleton (`js/utils/Config.js`) uses `fetch()` and `window.jsyaml` to load `config.yaml`, which do not exist in Node. **`tests/setup.js` globally mocks Config** via `vi.mock()` to return the same defaults as `Config._getDefaults()`.

- This mock is loaded automatically via `setupFiles` in `vitest.config.js`.
- You do **not** need to mock Config in individual test files.
- If a test needs a custom config value, use `Config.set(path, value)` and call `Config.clearOverrides()` in `beforeEach`.

## Test Factories (`helpers/testFactories.js`)

Use these instead of manually constructing test data:

| Factory | Purpose |
|---------|---------|
| `createAircraft(overrides)` | Creates a real `Aircraft` instance with optional property overrides |
| `createStateManager()` | Creates a `StateManager` with the default airport layout |
| `createSnapshot(overrides)` | Creates a mock simulation snapshot for AI provider testing |
| `createSnapshotAircraft(overrides)` | Creates a plain object matching `getStatusSnapshot()` shape |
| `advanceToState(aircraft, targetState)` | Walks an aircraft through valid transitions to reach a target state |

### Why `advanceToState` Exists

The Aircraft model enforces a strict state machine — you cannot set `ac.state = 'at_gate'` directly and expect consistent internal state. `advanceToState()` walks through each valid transition in order, triggering entry actions (e.g., `BOARDING` sets `isRefueling = true`, `TAKEOFF` sets `heading = 0`). Always use this when setting up test preconditions that require a specific state.

Exception: For tests that intentionally bypass the state machine (e.g., testing `isAirborne()` for each state), directly setting `ac.state` is acceptable.

## Conventions

### File Naming
- One test file per source module for unit tests: `Aircraft.test.js` tests `js/models/Aircraft.js`
- Exception: `AI.test.js` covers both `LLMAdapter.js` and `RuleBasedAI.js`; `Logging.test.js` covers `DecisionLogger.js`, `CrashAnalyzer.js`, and `PerformanceTracker.js`
- Integration tests are named by the pipeline they test, not by a single module

### Test Structure
- Use `describe()` blocks to group by feature/method
- Use `beforeEach()` to create fresh instances — tests must be independent and order-insensitive
- Prefer `createAircraft()` over `new Aircraft()` for deterministic test setup
- Clean up callsigns with `releaseCallsign()` if generating many in a single test (the callsign pool is module-level global state)

### Unit vs Integration

- **Unit tests** test one module in isolation. Other modules are either not involved or are real instances used only as dependencies (e.g., `StateManager` passed to `CollisionSystem`'s constructor).
- **Integration tests** wire up multiple real modules and verify the event chain produces the correct end state. No mocking at module boundaries.
- LLM provider files (`OpenAIProvider`, `AnthropicProvider`, etc.) are **not tested** — they are thin `fetch()` wrappers. The parsing and prompt logic they inherit from `LLMAdapter` is tested in `AI.test.js`.

### What NOT to Do

- Do not add `jsdom` or `happy-dom` — all tests run in plain Node
- Do not mock `StateManager`, `FuelSystem`, or `CollisionSystem` in integration tests — use real instances
- Do not test `Renderer.js` or `ControlPanel.js` — these are DOM/Canvas-dependent UI modules
- Do not rely on `setTimeout`/`setInterval` in tests — use direct method calls and state assertions
- Do not use `performance.now()` for assertions — it's available in Node but timing is non-deterministic

### SimulationEngine Testing Note

`SimulationEngine._tick()` uses `requestAnimationFrame` and `performance.now()`, which cannot run in Node. Tests for `SimulationEngine` call individual methods directly (`_applyDecision()`, `_requestAIDecisions()`, `reset()`, etc.) and verify event wiring by emitting events on subsystems and checking that the correct handlers fire. The `_tick()` loop itself is not tested — it is pure orchestration glue.

## Adding New Tests

When adding a test for a new or modified module:

1. Create the test file in `tests/unit/` following the naming convention
2. Import the module under test and any needed factories from `helpers/testFactories.js`
3. If the module depends on `Config`, it will automatically use the mocked defaults — no setup needed
4. If testing event emission, use `vi.fn()` handlers registered via `.on()` and assert with `expect(handler).toHaveBeenCalledWith(...)`
5. Run `npm test` to verify all tests still pass before committing
