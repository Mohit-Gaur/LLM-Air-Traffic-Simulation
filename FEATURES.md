# Feature Roadmap — LLM ATC Simulation

This document tracks the feature priorities for the Air Traffic Control simulation platform, organized by implementation priority.

---

## ✅ P0 — Core Platform (Implemented)

These features form the minimum viable benchmarking platform.

### Simulation Foundation
- **11-state aircraft lifecycle**: Approaching → Holding Air → Landing → Landed → Taxiing to Gate → Boarding → At Gate → Taxiing to Runway → Holding Ground → Takeoff → Departing
- **Dynamic fuel system**: Per-state consumption rates, low fuel warnings (< 25%), emergency threshold (< 15%), in-flight fuel exhaustion handling
- **4-layer collision detection**: Warning (400px) → Avoidance (150px) → Emergency (80px) → Crash (15px), with force-based separation vectors
- **Configurable airport layout**: 2 runways, 6 gates, terminal building — all driven by `config.yaml`
- **Rule-based AI controller**: Deterministic baseline for benchmarking — handles runway/gate assignment, departure sequencing, hold patterns

### LLM Integration
- **Cloud LLM providers**: OpenAI GPT-4o, Anthropic Claude, Google Gemini — with API key management and localStorage persistence
- **Ollama local LLM support**: Auto-discovery of local models via `/api/tags`, runtime model hot-swapping, configurable host URL
- **Standardized prompt engineering**: System prompt with prioritized rules (collision > fuel > safety > efficiency > fairness), structured user prompt with full airport state snapshot
- **JSON response parsing**: Tolerant parser that handles markdown code blocks, extracts arrays, and validates decision structure

### Boarding & Passenger Lifecycle
- **BOARDING state**: Dynamic duration based on aircraft passenger capacity (3s base + 0.08s per passenger)
- **GO_AROUND state**: Missed approach with climb-out physics, automatic transition to holding pattern after 3s
- **Passenger metadata**: Per-aircraft passenger count, origin/destination airports, boarding progress tracking (0–100%)
- **Parallel refueling**: Aircraft refuel during boarding, with configurable refuel rate and target level

### AI Safety Context
- **Collision warnings in prompts**: Active proximity warnings injected into LLM decision context with severity levels
- **Crash history feedback**: Last 3 crashes with involved callsigns and cause — AI learns from failures
- **COLLISION_AVOIDANCE action**: Dedicated decision type that forces go-arounds for landing aircraft or applies avoidance vectors
- **Fuel emergency context**: Active emergency/low-fuel counts surfaced in prompts with urgency indicators

### Rendering & UI
- **Canvas renderer**: Top-down airport with radar sweep, grid overlay, runway markings, gate connectors, taxiway paths
- **Aircraft sprites**: Twin-jet (A320, B737, B777), quad-jet (A380), turboprop (ATR72) — with nav lights, engine nacelles, swept wings
- **5-tab dashboard**: Controls, Aircraft list, Decision log, Metrics, Crash reports
- **Boarding progress bars**: Animated gradient fill with glow effect for aircraft in BOARDING state
- **Performance metrics**: Throughput, safety score, landings, departures, go-arounds, fuel emergencies, near misses, avg fuel at landing, avg landing time

---

## 🔲 P1 — Enhanced Benchmarking

Features that improve the rigor and depth of LLM comparison.

### Scenario Seeding & Reproducibility
- **Deterministic seed system**: Reproducible aircraft spawn sequences so identical scenarios can be presented to different LLMs
- **Scenario presets**: Pre-built stress tests (e.g., "5 simultaneous fuel emergencies", "runway closure mid-traffic", "mass holding pattern")
- **Benchmark suite runner**: Automated batch execution of scenario sets across multiple providers with result aggregation

### Scoring & Analytics
- **Weighted scoring model**: Configurable weights for safety, efficiency, throughput, and fuel management
- **Per-provider leaderboard**: Side-by-side comparison table with detailed breakdowns per metric
- **Decision quality scoring**: Rate individual AI decisions against optimal outcomes (e.g., "correct runway assignment given state")
- **Response latency tracking**: p50/p95/p99 latency per provider, with timeout handling and fallback behavior

### Weather System
- **Dynamic weather conditions**: Wind direction/speed affecting approach headings and fuel burn
- **Visibility levels**: Clear, haze, fog — affecting minimum separation distances
- **Weather events**: Thunderstorms that close runways temporarily, requiring real-time AI adaptation

### Advanced Traffic Patterns
- **Arrival/departure waves**: Realistic rush-hour traffic patterns instead of uniform random spawning
- **Aircraft priority classes**: VIP flights, medical emergencies, military aircraft — testing AI's ability to prioritize
- **Slot management**: Time-based arrival slots that the AI must respect or negotiate

---

## 🔲 P2 — Operational Realism

Features that deepen simulation fidelity.

### Ground Operations
- **Pushback sequence**: Gate departure requires pushback clearance before taxi
- **Taxiway routing**: Defined taxi paths with conflict detection at intersections
- **De-icing**: Winter weather requiring de-icing delays before departure
- **Ground vehicle traffic**: Fuel trucks, baggage carts, catering vehicles on taxiways

### Advanced Airspace
- **Multiple approach paths**: ILS, visual, RNAV approaches with different fuel/time profiles
- **Departure procedures (SIDs)**: Standard instrument departures with altitude/heading constraints
- **Altitude separation**: Vertical separation enforcement for holding stacks
- **Airspace sectors**: Handoff between approach and tower control zones

### Airline Operations
- **Connecting passengers**: Downstream delay propagation when feeder flights are late
- **Crew duty limits**: Aircraft grounded if crew hours exceed limits
- **Maintenance events**: Unscheduled maintenance requiring gate changes or cancellations
- **Fuel cost optimization**: AI must balance fuel reserves vs. tankering decisions

---

## 🔲 P3 — Platform & Integration

Features for broader adoption and tooling.

### Data & Export
- **Structured telemetry export**: Per-frame state snapshots in Parquet/CSV for offline analysis
- **Replay system**: Record and replay simulation sessions with frame-perfect state restoration
- **Grafana/Prometheus integration**: Real-time metrics streaming for monitoring dashboards

### Multi-Session
- **Headless mode**: Run benchmarks without browser rendering for faster throughput
- **Parallel provider testing**: Run the same scenario simultaneously against multiple LLMs
- **CI/CD integration**: GitHub Actions workflow that runs benchmark suites on PR and reports regressions

### Manual & Hybrid Control
- **Manual ATC mode**: Human-in-the-loop control for baseline comparison against AI
- **AI-assist mode**: AI suggests actions, human approves/rejects — measuring AI trustworthiness
- **Voice integration**: Natural language ATC commands via speech-to-text

---

## Priority Decision Framework

| Factor | P0 | P1 | P2 | P3 |
|--------|----|----|----|----|
| **Required for benchmarking?** | Yes | Improves rigor | Nice to have | Platform tooling |
| **Complexity** | Medium | Medium-High | High | High |
| **User value** | Core functionality | Deeper insights | Realism | Scale |
| **Dependencies** | None | P0 complete | P0 + P1 | P0 + P1 |
