# Simulation Findings

Issues discovered by running the ATC simulation and reviewing the full codebase. Organized by severity.

---

## 🔴 Critical Bugs

### 1. Gate Double-Occupancy — Multiple Aircraft Assigned to Same Gate

**Files:** `js/engine/StateManager.js` (lines 95–100, 122–128)

When an aircraft departs, the gate is freed in `startDeparture()` (line 125), but the aircraft's `assignedGate` property is **never set to null**. Later, when the same aircraft completes takeoff (TAKEOFF → DEPARTING transition, line 98), it blindly clears the gate again — even if a new aircraft has since been assigned to that gate.

**Reproduction sequence:**
1. Aircraft A is at Gate 2 → departure starts via `startDeparture()`
2. `startDeparture()` clears Gate 2 (`gt.occupied = false`), but does **not** clear `ac.assignedGate` — A still references Gate 2
3. Gate 2 is now free → Aircraft B is assigned Gate 2 and occupies it
4. Aircraft A reaches end of runway → TAKEOFF transition fires
5. `ac.assignedGate` is still set, so it executes `gt.occupied = false; gt.occupiedBy = null` — wiping Gate 2's occupancy despite B being there
6. Gate 2 is now marked free → Aircraft C gets assigned Gate 2
7. Both B and C are physically at Gate 2

**Root cause:** Two issues combine:
- `startDeparture()` does not null out `ac.assignedGate` after clearing the gate
- The TAKEOFF transition clears the gate without checking `gt.occupiedBy === ac.id` (unlike `removeAircraft()` which does check)

**Fix:** Add `ac.assignedGate = null` in `startDeparture()` after clearing the gate, **and** add a `gt.occupiedBy === ac.id` guard in the TAKEOFF transition (line 98) before clearing.

---

### 2. Departures Never Complete — Airport Deadlocks

**Files:** `js/ai/RuleBasedAI.js` (lines 66–76), `js/engine/StateManager.js` (lines 122–128)

With only 2 runways shared between arrivals and departures, and 6 gates that fill up quickly, the simulation deadlocks. The Rule-Based AI issues `START_DEPARTURE` decisions for ready aircraft, but incoming landings continuously occupy both runways. Departures are starved of runway access, gates stay full, and new landed aircraft have nowhere to go.

**Observed:** After ~1.2 minutes at 1x speed, metrics showed 7 landings and **0 departures**. All 6 gates were occupied by aircraft in AT_GATE state.

**Root cause:** No runway reservation or priority mechanism for departures. Arrivals always win the runway race because they're assigned runways during approach, before the runway is physically occupied.

---

### 3. Runway Conflict — `assignRunway` Doesn't Mark Runway Occupied

**File:** `js/engine/StateManager.js` (lines 105–111)

```js
assignRunway(acId, rwId) {
    const ac = this.getAircraft(acId), rw = this.getRunway(rwId);
    if (!ac || !rw) return false;
    ac.assignedRunway = rwId;
    if (ac.state === AircraftState.APPROACHING) ac.setTarget(rw.x + rw.length + 100, rw.y);
    return true;
}
```

The method does **not** check `rw.occupied` and does **not** set `rw.occupied = true`. The runway is only marked occupied later when the aircraft transitions from APPROACHING to LANDING (line 67). Multiple approaching aircraft can be assigned to the same runway simultaneously, creating collision risk on final approach.

**Fix:** Add an `rw.occupied` check and set `rw.occupied = true; rw.occupiedBy = ac.id` when assigning.

---

### 4. Play Button Shows "Start" During Auto-Start

**Files:** `js/main.js` (line 54), `js/ui/ControlPanel.js` (lines 155–160)

`main.js` calls `engine.start()` on load (auto-start), but `_updatePlayButton()` is only invoked from the button's click handler. The button remains as "▶ Start" even though the simulation is already running.

**Fix:** Call `controlPanel._updatePlayButton()` after `engine.start()` in `main.js`, or listen for the engine's `started` event.

---

## 🟠 Significant Logic Issues

### 5. Safety Score Overly Punitive Early On

**File:** `js/logging/PerformanceTracker.js` (lines 70–74)

```js
getSafetyScore() {
    const total = Math.max(1, this.landings + this.departures);
    const incidents = this.crashes * 10 + this.nearMisses * 2 + this.goArounds;
    return Math.max(0, Math.round((1 - incidents / (total + incidents)) * 100));
}
```

A single near miss (weight 2) with 7 landings yields `1 - 2/(7+2) = 78%`. The score drops dramatically from benign proximity events, making it misleading. A single collision avoidance trigger (which is the system working as designed) tanks the safety score.

---

### 6. Trail Rendering Has Dead/Broken Code

**File:** `js/rendering/Renderer.js` (lines 196–208)

```js
ctx.strokeStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba').replace('#', '');
// Use hex with alpha
ctx.globalAlpha = 0.2;
ctx.strokeStyle = color;  // ← overwrites line 201 immediately
```

Line 201 attempts to convert a hex color to RGBA but the approach is broken for hex strings (stripping `#` produces `00e5ff`, not a valid CSS color). Line 204 then immediately overwrites it with the original hex color, making line 201 dead code. The trail renders at 20% opacity purely via `globalAlpha`, which works by accident.

---

### 7. Long Boarding Times Cause Gate Congestion

**File:** `js/models/Aircraft.js` (lines 117–119)

```js
this.boardingDuration = 3000 + this.passengerCount * 80;  // ms
this.gateOperationDuration = this.boardingDuration + 5000;
```

For large aircraft:
- **A380** (500–850 pax): `3000 + 850×80 = 71,000ms` = **71 seconds** boarding + 5s turnaround = **76 seconds** per gate visit
- **B777** (300–400 pax): `3000 + 400×80 = 35,000ms` = **35 seconds** + 5s = **40 seconds**

With only 6 gates, these durations guarantee gridlock. Combined with the departure starvation (Issue #2), gates never free up.

---

### 8. FuelSystem Leaks Tracking Set Entries

**File:** `js/engine/FuelSystem.js` (lines 42–57)

When aircraft are removed (crashed or departed), `emergencyAircraft` and `lowFuelAircraft` Sets are never cleaned up. These sets only clear entries when fuel rises above thresholds, which never happens for removed aircraft.

---

## 🟡 Minor Issues

### 9. Snapshot History Mixes Simulation Time with Wall Time

**File:** `js/logging/PerformanceTracker.js` (lines 50–61)

`takeSnapshot(now)` receives `simulationTime` (scaled by speed), but `this.startTime` is `Date.now()` (wall clock). The subtraction `now - this.startTime` produces meaningless values in the history array.

---

### 10. Double Resize Event Listener

**File:** `js/main.js` (lines 24, 35–38)

Two `resize` listeners are registered. Line 35 captures `origResize = resizeCanvas` but never uses it. The second listener calls `renderer.resize()` redundantly.

---

### 11. Missing Parentheses in Crash Factor Check

**File:** `js/logging/CrashAnalyzer.js` (line 40)

```js
if (a.state === 'landing' && b.state === 'takeoff' || a.state === 'takeoff' && b.state === 'landing')
```

Works correctly due to operator precedence (`&&` before `||`), but intent is unclear. Should be:

```js
if ((a.state === 'landing' && b.state === 'takeoff') || (a.state === 'takeoff' && b.state === 'landing'))
```

---

### 12. Inconsistent Runway State Ownership

**Files:** `js/engine/StateManager.js` (line 98, 103), `js/engine/FuelSystem.js` (lines 102–104), `js/engine/CollisionSystem.js` (line 92)

Runway `occupied` state is managed by multiple systems without a single source of truth:
- `StateManager._processTransitions()` sets/clears on state changes
- `FuelSystem._requestRunwayClearing()` manually clears `rw.occupied` and `rw.occupiedBy`
- `CollisionSystem._handleEmergencyAvoidance()` triggers `startGoAround()` which releases the runway via `Aircraft`

This scattered ownership makes it easy for the runway state to become inconsistent.

---

### 13. `gateOperationDuration` Is Defined but Never Used

**File:** `js/models/Aircraft.js` (line 119)

```js
this.gateOperationDuration = this.boardingDuration + 5000;
```

This property is computed but never read anywhere in the codebase. The actual departure readiness is determined by `stateTimer >= 5000` in `isReadyForDeparture()`.

---

## Summary

| Severity | Count | Key Impact |
|----------|-------|-----------|
| 🔴 Critical | 4 | Gate corruption, departure deadlock, runway conflicts, stale UI |
| 🟠 Significant | 4 | Misleading metrics, dead code, gate congestion, memory leaks |
| 🟡 Minor | 5 | Mixed time bases, unused code, inconsistent state ownership |

The most impactful issue is the **gate double-occupancy bug** (#1), which corrupts airport state and leads to cascading problems. The **departure deadlock** (#2) is the most visible symptom during normal operation — the airport fills up and stops functioning within ~2 minutes.
