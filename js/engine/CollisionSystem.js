// ============================================================================
// CollisionSystem.js — 4-Layer Collision Prevention
// ============================================================================

import { AircraftState } from '../models/Aircraft.js';
import { distance, normalize, angle } from '../utils/helpers.js';
import Config from '../utils/Config.js';
import { EventEmitter } from '../utils/helpers.js';

export class CollisionSystem extends EventEmitter {
    constructor(stateManager) {
        super();
        this.stateManager = stateManager;
        this.activeWarnings = new Map();  // key: "id1-id2", value: { level, since }
        this.crashLog = [];
    }

    update(deltaTime) {
        const aircraft = this.stateManager.aircraft.filter(
            a => a.state !== AircraftState.REMOVED && a.state !== AircraftState.AT_GATE && a.state !== AircraftState.BOARDING
        );

        const warnDist = Config.get('collision.warning_distance', 500);
        const avoidDist = Config.get('collision.avoidance_distance', 200);
        const emergDist = Config.get('collision.emergency_distance', 100);
        const crashDist = Config.get('collision.crash_distance', 10);
        const avoidForce = Config.get('collision.avoidance_force', 2.0);
        const emergForce = Config.get('collision.emergency_force', 5.0);

        const currentPairs = new Set();

        for (let i = 0; i < aircraft.length; i++) {
            for (let j = i + 1; j < aircraft.length; j++) {
                const a = aircraft[i], b = aircraft[j];
                // Skip ground-air pairs
                if (a.isAirborne() !== b.isAirborne()) continue;
                // Skip if either at gate or boarding (stationary)
                if (a.state === AircraftState.AT_GATE || b.state === AircraftState.AT_GATE) continue;
                if (a.state === AircraftState.BOARDING || b.state === AircraftState.BOARDING) continue;
                // Skip ground taxiing pairs (they share controlled taxiways)
                const groundTaxiStates = [AircraftState.TAXIING_TO_GATE, AircraftState.TAXIING_TO_RUNWAY, AircraftState.LANDED, AircraftState.HOLDING_GROUND];
                if (groundTaxiStates.includes(a.state) && groundTaxiStates.includes(b.state)) continue;

                const dist = distance(a, b);
                const pairKey = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
                currentPairs.add(pairKey);

                if (dist <= crashDist) {
                    this._handleCrash(a, b, dist);
                } else if (dist <= emergDist) {
                    this._handleEmergencyAvoidance(a, b, dist, emergForce);
                    this._setWarning(pairKey, 'emergency', a, b);
                } else if (dist <= avoidDist) {
                    this._handleSmartAvoidance(a, b, dist, avoidForce);
                    this._setWarning(pairKey, 'avoidance', a, b);
                } else if (dist <= warnDist) {
                    this._setWarning(pairKey, 'warning', a, b);
                } else {
                    this._clearWarning(pairKey);
                }
            }
        }

        // Clear stale warnings
        for (const [key] of this.activeWarnings) {
            if (!currentPairs.has(key)) this._clearWarning(key);
        }
    }

    _handleSmartAvoidance(a, b, dist, force) {
        const dx = a.x - b.x, dy = a.y - b.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const strength = force * (1 - dist / Config.get('collision.avoidance_distance', 200));
        a.applyAvoidance({ x: (dx / len) * strength, y: (dy / len) * strength });
        b.applyAvoidance({ x: -(dx / len) * strength, y: -(dy / len) * strength });
        a.collisionAvoidanceActive = true;
        b.collisionAvoidanceActive = true;
    }

    _handleEmergencyAvoidance(a, b, dist, force) {
        const dx = a.x - b.x, dy = a.y - b.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const strength = force * (1 - dist / Config.get('collision.emergency_distance', 100));
        a.applyAvoidance({ x: (dx / len) * strength * 2, y: (dy / len) * strength * 2 });
        b.applyAvoidance({ x: -(dx / len) * strength * 2, y: -(dy / len) * strength * 2 });

        // Speed adjustments
        if (a.speed > b.speed) { a.speed *= 0.95; } else { b.speed *= 0.95; }

        // If both landing, one goes around
        if (a.state === AircraftState.LANDING && b.state === AircraftState.LANDING) {
            if (a.fuel > b.fuel) a.startGoAround(); else b.startGoAround();
            this.emit('go_around_collision', { a, b });
        }
    }

    _handleCrash(a, b, dist) {
        const crash = {
            time: Date.now(), aircraftA: a.getStatusSnapshot(), aircraftB: b.getStatusSnapshot(),
            distance: dist, type: 'collision'
        };
        this.crashLog.push(crash);
        this.emit('crash', crash);
        // Remove both
        this.stateManager.removeAircraft(a);
        this.stateManager.removeAircraft(b);
    }

    _setWarning(key, level, a, b) {
        const existing = this.activeWarnings.get(key);
        if (!existing || existing.level !== level) {
            this.activeWarnings.set(key, { level, since: Date.now(), aircraftA: a.id, aircraftB: b.id });
            this.emit('warning', { key, level, a: a.callsign, b: b.callsign });
        }
    }

    _clearWarning(key) {
        if (this.activeWarnings.has(key)) {
            this.activeWarnings.delete(key);
        }
    }

    getWarnings() { return Array.from(this.activeWarnings.entries()); }
    getCrashLog() { return [...this.crashLog]; }
    getCrashCount() { return this.crashLog.length; }
}
