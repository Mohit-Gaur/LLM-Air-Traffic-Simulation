# LLM ATC Simulation — Conversation Summary

## The Idea

Build a sophisticated airport simulation designed specifically for **testing and comparing different Large Language Models** in complex, real-time air traffic control scenarios. The simulation serves as a controlled environment to objectively evaluate how various AI systems handle:

- **Safety prioritization** — fuel emergencies, collision avoidance
- **Resource optimization** — runway and gate assignments
- **Crisis management** — multiple emergency scenarios
- **Decision speed and consistency** under pressure
- **Learning from mistakes** — crash analysis and improvement

By presenting identical scenarios to different AI models (OpenAI GPT-4o, Anthropic Claude, Google Gemini, local Ollama models), we can benchmark their performance head-to-head in safety-critical decision making.

---

## Architecture

**Stack:** Pure HTML5/Canvas with ES modules — zero build tools, zero dependencies (except js-yaml for config parsing).

```
Project/
├── index.html              # App shell with 5-tab sidebar
├── config.yaml             # All simulation parameters
├── css/index.css           # Premium dark theme with glassmorphism
├── js/
│   ├── main.js             # Bootstrap and auto-start
│   ├── models/
│   │   └── Aircraft.js     # State machine, physics, passenger metadata
│   ├── engine/
│   │   ├── SimulationEngine.js  # Main loop coordinator
│   │   ├── StateManager.js      # Lifecycle transitions, airport layout
│   │   ├── FlightScheduler.js   # Timed aircraft spawning
│   │   ├── CollisionSystem.js   # 4-layer collision detection
│   │   └── FuelSystem.js        # Fuel consumption and emergencies
│   ├── ai/
│   │   ├── LLMAdapter.js        # Base class with prompt engineering
│   │   ├── RuleBasedAI.js       # Deterministic baseline
│   │   ├── OpenAIProvider.js    # GPT-4o integration
│   │   ├── AnthropicProvider.js # Claude integration
│   │   ├── GeminiProvider.js    # Gemini integration
│   │   └── OllamaProvider.js    # Local LLM via Ollama
│   ├── rendering/
│   │   └── Renderer.js          # Canvas drawing (aircraft sprites, airport, HUD)
│   ├── ui/
│   │   └── ControlPanel.js      # Dashboard tabs, controls, metrics
│   └── logging/
│       ├── DecisionLogger.js    # AI decision audit trail
│       ├── CrashAnalyzer.js     # Post-crash analysis reports
│       └── PerformanceTracker.js # Throughput, safety score, latency
├── README.md
└── FEATURES.md             # P0-P3 roadmap
```

### Key Design Decisions
- **Config-driven**: All airport layout, fuel rates, spawn rates, collision thresholds live in `config.yaml`
- **Event-driven**: `StateManager` and systems use an `EventEmitter` pattern for loose coupling
- **Provider-agnostic**: All LLM providers implement the same `LLMAdapter` interface with standardized prompt construction and JSON response parsing
- **State machine**: Aircraft lifecycle is enforced via a `VALID_TRANSITIONS` map — invalid transitions are rejected with a warning

---

## What Was Built (Chronological)

### Session 1 — Foundation
1. Created the full simulation from scratch: canvas renderer with radar sweep, airport terminal, runways, gates
2. Implemented 11-state aircraft lifecycle with physics (approach, holding patterns, landing, taxi, gate ops, takeoff, departure)
3. Built 4-layer collision system (warning → avoidance → emergency → crash)
4. Built fuel management with emergency detection and runway clearing
5. Created LLM adapter base class with prompt engineering, plus OpenAI/Anthropic/Gemini providers
6. Implemented rule-based AI as deterministic baseline
7. Built 5-tab dashboard: Controls, Aircraft list, Decision log, Metrics, Crash reports
8. Added aircraft sprites: twin-jet (A320, B737, B777), quad-jet (A380), turboprop (ATR72) with nav lights and animated propellers

### Session 1 — Feature Comparison
- Compared against [jjasghar/ai-airport-simulation](https://github.com/jjasghar/ai-airport-simulation) to identify gaps
- Categorized features into P0 (must-have), P1 (enhanced benchmarking), P2 (operational realism), P3 (platform tooling)

### Session 1 — P0 Features
1. **Ollama local LLM support** — Auto-discovery of local models, runtime model hot-swapping, connect button UI
2. **BOARDING and GO_AROUND states** — Dynamic boarding duration based on passenger capacity, go-around with climb-out physics
3. **Passenger metadata** — Per-aircraft passenger count, origin/destination airports, boarding progress tracking
4. **AI safety context enrichment** — Collision warnings, crash history feedback, COLLISION_AVOIDANCE action in prompts

### Session 2 — Bug Fixes
1. **Browser caching** — Added `?v=2` cache-busting to CSS/JS imports (caused stale JS to run old transition logic)
2. **Collision system** — Used `AircraftState.BOARDING` constant instead of string literal; excluded boarding aircraft from collision checks
3. **Departure readiness** — Changed `isReadyForDeparture()` to use `stateTimer` (time in AT_GATE) instead of `gateTimer` (accumulated from boarding)

### Session 2 — Git History
- Created 21 incremental commits simulating the project's development from scratch
- Each commit adds specific files with `git add` (not `git add .`)
- Early commits use v1 versions of files (pre-P0), later commits show the P0 feature additions as diffs
- History: foundation → core sim → rendering → safety → AI → UI → Ollama → boarding → UI polish → AI enrichment → README

### Session 2 — Gate Double-Assignment Bug
- **Symptom**: 2 aircraft visually occupying the same gate
- **Root cause**: `assignGate()` set `ac.assignedGate` but didn't mark `gt.occupied = true` — left a 1-frame window where the gate appeared free
- **Fix**: `assignGate()` now immediately reserves the gate; LANDED transition verifies `gt.occupiedBy === ac.id` before taxiing
- **Additional hardening** (user-applied): Takeoff gate-clearing now checks `gt.occupiedBy === ac.id`; `startDeparture` clears `ac.assignedGate = null` after freeing the gate

---

## How to Run

```bash
cd /home/user/Project
python3 -m http.server 3000
# Open http://localhost:3000 in browser
```

The simulation auto-starts. Use the sidebar to:
- Adjust speed (0.5x–5x)
- Switch AI providers (Rule-Based, Ollama, OpenAI, Anthropic, Gemini)
- Toggle aircraft spawning
- Export decision logs as JSON

Debug via `window._engine` in the browser console.

---

## Current State & Next Steps

### Working
- Full aircraft lifecycle including boarding with passenger-based duration
- 5 AI providers (1 local, 3 cloud, 1 rule-based baseline)
- Collision avoidance with AI feedback loop (crash history in prompts)
- Comprehensive metrics dashboard with safety scoring

### Potential Next Steps (P1)
- Deterministic seed system for reproducible benchmarks
- Scenario presets (mass emergencies, runway closures)
- Automated benchmark suite runner with result aggregation
- Weather system affecting approaches and fuel burn
- Per-provider leaderboard with weighted scoring
