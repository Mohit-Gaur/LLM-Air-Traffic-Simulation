# ✈ LLM Air Traffic Control Simulation

A sophisticated airport simulation designed for testing and comparing Large Language Models (LLMs) in complex, real-time air traffic control scenarios. This project provides a controlled environment to evaluate how various AI systems handle safety-critical decision making, resource allocation, and emergency management in aviation operations.

![Simulation Preview](https://img.shields.io/badge/Status-Active-00e676?style=flat-square) ![License](https://img.shields.io/badge/License-MIT-00e5ff?style=flat-square) ![No Build](https://img.shields.io/badge/Build-None_Required-76ff03?style=flat-square)

---

## Purpose

By presenting identical scenarios to different AI models, this simulation objectively evaluates:

| Metric | What It Measures |
|--------|-----------------|
| **Safety Prioritization** | Fuel emergencies, collision avoidance responses |
| **Resource Optimization** | Runway and gate assignments under load |
| **Crisis Management** | Handling multiple simultaneous emergencies |
| **Decision Speed** | Response latency and consistency under pressure |
| **Learning from Mistakes** | Crash analysis and improvement over time |

## Quick Start

Just open and run.

```bash
# Option 1: Python (built-in)
python3 -m http.server 3000

# Option 2: Any static file server
npx -y http-server -p 3000
```

Then open **http://localhost:3000** in your browser. The simulation auto-starts.

> **Note:** A local HTTP server is required because the app uses ES modules and loads `config.yaml` via `fetch()`.

## Architecture

```
Project/
├── index.html                  # Main entry point
├── config.yaml                 # YAML-based simulation configuration
├── README.md                   # This file
├── css/
│   └── index.css               # Premium dark theme (glassmorphism, neon)
└── js/
    ├── main.js                 # App bootstrap
    ├── engine/
    │   ├── SimulationEngine.js # Main loop coordinator
    │   ├── FlightScheduler.js  # Sector-based aircraft spawning
    │   ├── CollisionSystem.js  # 4-layer collision prevention
    │   ├── FuelSystem.js       # Fuel management & emergency detection
    │   └── StateManager.js     # Aircraft lifecycle & state transitions
    ├── models/
    │   └── Aircraft.js         # Aircraft entity (11 states, full lifecycle)
    ├── ai/
    │   ├── LLMAdapter.js       # Abstract adapter interface
    │   ├── RuleBasedAI.js      # Deterministic baseline (no API key)
    │   ├── OpenAIProvider.js   # OpenAI GPT integration
    │   ├── AnthropicProvider.js# Anthropic Claude integration
    │   └── GeminiProvider.js   # Google Gemini integration
    ├── rendering/
    │   └── Renderer.js         # Canvas rendering with aircraft silhouettes
    ├── logging/
    │   ├── DecisionLogger.js   # AI decision logging with timing
    │   ├── CrashAnalyzer.js    # Root cause analysis for crashes
    │   └── PerformanceTracker.js # Throughput & safety metrics
    ├── ui/
    │   └── ControlPanel.js     # Tabbed dashboard & controls
    └── utils/
        ├── Config.js           # YAML configuration loader
        └── helpers.js          # Math, geometry, callsign generation
```

### System Components

```
SimulationEngine (main loop)
├── FlightScheduler    - Sector-based aircraft spawning, congestion-aware rates
├── CollisionSystem    - 4-layer collision prevention (warn → avoid → emergency → crash)
├── FuelSystem         - Per-state consumption, emergency detection, runway clearing
├── StateManager       - Aircraft lifecycle, runway/gate resource management
├── AI Adapter         - Pluggable LLM interface (hot-swappable mid-simulation)
├── Renderer           - HTML5 Canvas with radar sweep, aircraft silhouettes, HUD
└── ControlPanel       - Tabbed UI (Controls, Aircraft, Decisions, Metrics, Crashes)
```

## Aircraft Types

The simulation features five distinct aircraft types, each rendered as a recognizable top-down silhouette:

| Type | Category | Engines | Visual |
|------|----------|---------|--------|
| **A320** | Narrow-body jet | Twin underwing turbofans | Swept wings, 2 nacelles |
| **B737** | Narrow-body jet | Twin underwing turbofans | Compact swept wings, 2 nacelles |
| **B777** | Wide-body jet | Twin underwing turbofans | Large swept wings, wider fuselage |
| **A380** | Wide-body jet | 4 underwing turbofans | Massive wings, 4 nacelles |
| **ATR72** | Turboprop | Twin propellers | Straight high wings, spinning prop discs |

All aircraft feature:
- **Navigation lights** - red (port) and green (starboard) wingtip lights that blink
- **Nose/tail lights** - always-on white position lights
- **State-based coloring** - cyan (approaching), green (landing), amber (holding), purple (departing)
- **Fuel bars** - green → yellow → red as fuel depletes

## Aircraft Lifecycle (11 States)

```
APPROACHING → HOLDING_AIR → LANDING → LANDED → TAXIING_TO_GATE →
    AT_GATE (refueling) → TAXIING_TO_RUNWAY → HOLDING_GROUND →
        TAKEOFF → DEPARTING → REMOVED
```

Each state has specific fuel consumption rates, speed profiles, and transition rules.

## Collision Prevention (4 Layers)

| Layer | Distance | Response |
|-------|----------|----------|
| **Warning** | 400px | Yellow alert indicator on HUD |
| **Smart Avoidance** | 150px | Gentle steering vectors applied |
| **Emergency** | 80px | Hard avoidance, speed changes, go-around triggers |
| **Crash** | 15px | Crash event logged, aircraft removed, root cause analysis |

## Fuel Management

- **Per-state consumption rates** - takeoff: 30%, holding: 20%, cruise: 15%, landing: 10%
- **Emergency thresholds** - critical (<15%), low (<25%)
- **Automatic priority** - fuel-emergency aircraft get immediate runway assignment
- **Runway clearing** - can force go-arounds to free runways for emergencies
- **Refueling at gates** - 0.5%/second with random target between 50-100%

## AI Providers

### Built-in (No API Key Required)

- **Rule-Based AI** - deterministic controller with priority-based decisions. Serves as baseline for LLM comparison.

### LLM Providers (API Key Required)

| Provider | Model | How to Enable |
|----------|-------|--------------|
| **OpenAI** | GPT-4o | Select from dropdown - enter API key |
| **Anthropic** | Claude Sonnet | Select from dropdown - enter API key |
| **Google** | Gemini 2.5 Flash | Select from dropdown - enter API key |

API keys are stored **only in your browser's localStorage** and are sent exclusively to the respective provider's API endpoint.

### Hot-Swapping

Switch between AI providers mid-simulation to compare decision-making in real-time. All decisions are logged with the provider name and response time.

## Metrics & Analysis

### Performance Dashboard

| Metric | Description |
|--------|-------------|
| Throughput | Successful operations per minute |
| Safety Score | Weighted composite of incidents |
| Avg Fuel at Landing | Fuel efficiency indicator |
| Avg Landing Time | Approach-to-gate cycle time |
| Crashes / Go-Arounds | Safety event counts |
| Near Misses | Emergency avoidance triggers |

### Decision Logging

Every AI decision is logged with:
- Timestamp and provider name
- Action taken and parameters
- Reasoning (AI's explanation)
- Response time in milliseconds

### Crash Analysis

Each crash generates a detailed report:
- Aircraft states at time of collision
- Contributing factors (fuel, runway conflict, avoidance failure)
- Recent AI decisions involving the aircraft
- Actionable recommendation for improvement

### Export

Click **"Export Logs"** to download the complete decision history as JSON for external analysis.

## Configuration

All simulation parameters are defined in [`config.yaml`](config.yaml) - human-readable YAML:

```yaml
aircraft:
  spawn_rate: { min: 5000, max: 12000 }  # ms between spawns
  max_active: 12
  fuel:
    emergency_threshold: 15               # % fuel - critical
    low_threshold: 25                     # % fuel - low priority
    refuel_rate: 0.5                      # % per second at gate

collision:
  warning_distance: 400                   # px
  avoidance_distance: 150
  crash_distance: 15
  avoidance_force: 4.0

ai:
  decision_interval: 3000                 # ms between AI calls
  timeout: 10000                          # max wait for AI response
```

## Controls

| Control | Action |
|---------|--------|
| **▶ Start / ⏸ Pause** | Start or pause the simulation |
| **⟲ Reset** | Clear all aircraft and reset metrics |
| **Speed (0.5x–5x)** | Adjust simulation speed |
| **AI Controller** | Switch between AI providers |
| **Spawning ON/OFF** | Toggle aircraft generation |
| **Export Logs** | Download decision log as JSON |

### Sidebar Tabs

- **Controls** - simulation controls and quick metrics
- **Aircraft** - live list of all aircraft with state and fuel
- **Decisions** - scrollable AI decision log with timestamps
- **Metrics** - full performance dashboard with throughput chart
- **Crashes** - crash analysis reports with contributing factors

## Technical Details

- **Zero dependencies** - no npm, no build tools, no frameworks
- **Pure ES modules** - modern `import`/`export` syntax
- **HTML5 Canvas** - 60fps rendering with `requestAnimationFrame`
- **YAML config** - loaded via `js-yaml` CDN at runtime
- **localStorage** - API keys persisted securely in-browser
- **Event-driven** - components communicate via `EventEmitter` pattern

## License

MIT License - use freely for research, education, and AI evaluation.
