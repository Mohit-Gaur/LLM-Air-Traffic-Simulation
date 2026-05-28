# Code Analysis Report

## Critical Issues

### 1. Gemini API Key in URL
**File:** `js/ai/GeminiProvider.js`  
**Severity:** 🔴 HIGH

The API key is passed as a query parameter (`?key=...`) instead of in an Authorization header. This leaks the key into browser history, network logs, and stack traces.

### 2. Config Defaults Mismatch
**Files:** `js/utils/Config.js`, `config.yaml`  
**Severity:** 🔴 HIGH

Hardcoded fallback defaults in `Config.js` differ significantly from `config.yaml`. If config.yaml fails to load, the simulation behaves completely differently:

| Setting | config.yaml | Config.js Default |
|---------|-------------|-------------------|
| `aircraft.spawn_rate.min` | 5000 | 4000 |
| `aircraft.spawn_rate.max` | 12000 | 9000 |
| `aircraft.max_active` | 12 | 15 |
| `collision.warning_distance` | 400 | 500 |
| `collision.avoidance_distance` | 150 | 200 |
| `collision.avoidance_force` | 4.0 | 2.0 |
| `collision.emergency_force` | 8.0 | 5.0 |
| `aircraft.types` weights | 30/28/15/10 | 40/35/15/10 |

The same stale defaults also appear inline in `CollisionSystem.js`, `FlightScheduler.js`, and `FuelSystem.js`.

---

## Duplication

### 3. Identical `getDecisions()` Boilerplate in All LLM Providers
**Files:** `js/ai/OpenAIProvider.js`, `AnthropicProvider.js`, `GeminiProvider.js`, `OllamaProvider.js`, `AzureAIProvider.js`

All five providers repeat the same ~20-line try/catch + timing + parse pattern:

```javascript
const start = performance.now();
try {
    const resp = await fetch(this.endpoint, { ... });
    const data = await resp.json();
    this._trackResponseTime(performance.now() - start);
    if (data.choices?.[0]?.message?.content) {
        if (data.usage) this.totalTokens += data.usage.total_tokens;
        return this._parseResponse(data.choices[0].message.content);
    }
    return [];
} catch (e) {
    console.error('[Provider] Error:', e);
    this._trackResponseTime(performance.now() - start);
    return [];
}
```

`LLMAdapter` already has `_trackResponseTime()` and `_parseResponse()` but doesn't provide a template method for the HTTP call itself. ~100 lines of duplicated error handling.

**Recommendation:** Add a `_callAPI(url, headers, body, extractContent)` template method to `LLMAdapter`.

### 4. Refueling Logic Copied in Aircraft.js
**File:** `js/models/Aircraft.js`

The same 6-line refueling block appears identically in both the `BOARDING` and `AT_GATE` state handlers:

```javascript
if (this.isRefueling && this.fuel < this.refuelTarget) {
    const refuelRate = Config.get('aircraft.fuel.refuel_rate', 0.5);
    this.fuel = Math.min(this.refuelTarget, this.fuel + refuelRate * dt);
    if (this.fuel >= this.refuelTarget) {
        this.isRefueling = false;
    }
}
```

**Recommendation:** Extract into `_updateRefueling(dt)`.

### 5. State Colors Defined in Two Places
**Files:** `js/rendering/Renderer.js` (`STATE_COLORS` constant), `js/ui/ControlPanel.js` (`_getStateColor()` method)

Both define the same 11 state→color mappings independently. If a color changes, it must be updated in two places.

**Recommendation:** Move to a shared module or `Config`.

### 6. Avoidance Vector Math Duplicated
**File:** `js/engine/CollisionSystem.js`

`_handleSmartAvoidance()` and `_handleEmergencyAvoidance()` have nearly identical dx/dy/normalize/apply logic:

```javascript
const dx = a.x - b.x, dy = a.y - b.y;
const len = Math.sqrt(dx * dx + dy * dy) || 1;
const strength = force * (1 - dist / threshold);
a.applyAvoidance({ x: (dx / len) * strength, y: (dy / len) * strength });
b.applyAvoidance({ x: -(dx / len) * strength, y: -(dy / len) * strength });
```

**Recommendation:** Extract into `_applyRepulsionForce(a, b, dist, force, threshold, multiplier)`.

### 7. Runway/Gate Clearing Repeated 8+ Times
**File:** `js/engine/StateManager.js`

The pattern below appears in `removeAircraft()`, `_processTransitions()` (LANDED state, TAKEOFF state), and elsewhere:

```javascript
if (rw && rw.occupiedBy === ac.id) { rw.occupied = false; rw.occupiedBy = null; }
```

**Recommendation:** Extract into `_clearRunway(ac)` and `_clearGate(ac)` helper methods.

---

## Dead Code

### 8. `origResize` Assigned but Never Used
**File:** `js/main.js` (line 35)

```javascript
const origResize = resizeCanvas; // ← never referenced
```

### 9. `_drawCollisionZones()` Does Nothing
**File:** `js/rendering/Renderer.js`

Iterates over collision warnings but the loop body is empty with a comment "we skip visual":

```javascript
_drawCollisionZones(ctx, collisionSystem) {
    for (const [, warning] of collisionSystem.activeWarnings) {
        const a = warning.aircraftA;
        const b = warning.aircraftB;
        // We don't have position here, so we skip visual — handled per-aircraft
    }
}
```

### 10. Unused Aircraft Properties
**File:** `js/models/Aircraft.js`

- `engines` — set in constructor from config, never read anywhere in the codebase
- `gateOperationDuration` — set but never used; `isReadyForDeparture()` hardcodes `5000` directly instead

### 11. Aircraft Type `color` in config.yaml Unused
**File:** `config.yaml`

Each aircraft type defines a `color` field (e.g., `color: "#00e5ff"`), but the Renderer uses state-based colors (`STATE_COLORS`), not type-based colors. These config values are never read.

---

## Inconsistencies

### 12. RuleBasedAI Mixes String Literals and Enum Constants
**File:** `js/ai/RuleBasedAI.js`

Imports `AircraftState` but uses raw strings in some comparisons:

```javascript
import { AircraftState } from '../models/Aircraft.js';
// ...
if (ac.state === 'holding_air' && ac.assignedRunway) { // ← string literal
```

Should use `AircraftState.HOLDING_AIR` consistently.

### 13. Two Resize Listeners on `window`
**File:** `js/main.js`

Two separate listeners for the same event:

```javascript
window.addEventListener('resize', resizeCanvas);           // listener 1
window.addEventListener('resize', () => {                   // listener 2
    renderer.resize(canvas.width, canvas.height);
});
```

Should be a single unified handler.

### 14. Token Counting Differs Across Providers

| Provider | Token Tracking |
|----------|---------------|
| OpenAI | `usage.total_tokens` |
| Anthropic | `usage.input_tokens + usage.output_tokens` |
| Gemini | `usageMetadata.promptTokenCount + candidatesTokenCount` |
| Azure AI | `usage.total_tokens` |

No normalization — stats aren't comparable across providers.

### 15. AzureAIProvider Endpoint Conditions Overlap
**File:** `js/ai/AzureAIProvider.js`

Two separate branches produce identical output:

```javascript
} else if (this.baseEndpoint.includes('.openai.azure.com')) {
    this.chatUrl = `${this.baseEndpoint}/openai/v1/chat/completions`;
} else if (this.baseEndpoint.includes('.services.ai.azure.com')) {
    this.chatUrl = `${this.baseEndpoint}/openai/v1/chat/completions`;  // ← same
}
```

---

## Potential Bugs

### 16. Greedy Regex in JSON Parsing
**File:** `js/ai/LLMAdapter.js`

`_parseResponse()` uses `/\[[\s\S]*\]/` (greedy) which matches from the first `[` to the last `]` in the entire response. If the LLM output contains text between two arrays, the regex captures garbage:

```
Input:  [{"id":"1"}] Some text {"nested":[1,2,3]}
Match:  [{"id":"1"}] Some text {"nested":[1,2,3]}  ← too much
```

**Fix:** Use a non-greedy pattern or parse more carefully.

### 17. Callsign Collision on Exhaustion
**File:** `js/utils/helpers.js`

`generateCallsign()` returns a potentially duplicate callsign if 100 random attempts fail — no error, no warning, silent duplicate.

### 18. `_applyDecision` Doesn't Validate After Failed Callsign Lookup
**File:** `js/engine/SimulationEngine.js`

If neither UUID nor callsign lookup finds the aircraft, the original invalid `aircraftId` is still passed to `assignRunway()` etc., which just returns `false`. The decision is logged as failed but the root cause (aircraft no longer exists) is not surfaced.

---

## Complexity

### 19. `ControlPanel._init()` is 135 Lines
**File:** `js/ui/ControlPanel.js`

One method handles tab switching, playback controls, AI provider selection (5+ conditional blocks), API key persistence, spawn toggle, log export, and 7+ event listener registrations.

**Recommendation:** Split into `_setupTabSwitching()`, `_setupPlaybackControls()`, `_setupAIProviderSelector()`, `_setupEventListeners()`.

### 20. DOM Regenerated Every Frame
**File:** `js/ui/ControlPanel.js`

- `_updateAircraftList()` rebuilds the entire aircraft list HTML string and replaces `innerHTML` on every frame
- `_updateMetrics()` updates 15+ DOM elements per frame

**Recommendation:** Use dirty-checking or only update when values change.
