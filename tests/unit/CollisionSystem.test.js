// ============================================================================
// CollisionSystem.test.js — Tests for 4-layer collision prevention
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollisionSystem } from '../../js/engine/CollisionSystem.js';
import { StateManager } from '../../js/engine/StateManager.js';
import { AircraftState } from '../../js/models/Aircraft.js';
import { createAircraft, advanceToState } from '../helpers/testFactories.js';

describe('CollisionSystem', () => {
    let sm, cs;

    beforeEach(() => {
        sm = new StateManager();
        cs = new CollisionSystem(sm);
    });

    function addPair(opts1 = {}, opts2 = {}) {
        const defaults = { state: AircraftState.APPROACHING, assignedRunway: 1 };
        const ac1 = createAircraft({ ...defaults, ...opts1 });
        const ac2 = createAircraft({ ...defaults, ...opts2 });
        sm.addAircraft(ac1);
        sm.addAircraft(ac2);
        return [ac1, ac2];
    }

    // ─── Distance Thresholds ─────────────────────────────────────────────

    describe('distance thresholds', () => {
        it('no warnings when aircraft far apart (> 400px)', () => {
            const [a, b] = addPair({ x: 0, y: 0 }, { x: 500, y: 0 });
            cs.update(16);
            expect(cs.getWarnings()).toHaveLength(0);
        });

        it('warning at warning distance (< 400px)', () => {
            const [a, b] = addPair({ x: 0, y: 0 }, { x: 350, y: 0 });
            const handler = vi.fn();
            cs.on('warning', handler);
            cs.update(16);
            expect(handler).toHaveBeenCalled();
            expect(handler.mock.calls[0][0].level).toBe('warning');
        });

        it('avoidance force at avoidance distance (< 150px)', () => {
            const [a, b] = addPair({ x: 0, y: 0 }, { x: 120, y: 0 });
            cs.update(16);
            // Both should have avoidance applied
            expect(a.collisionAvoidanceActive).toBe(true);
            expect(b.collisionAvoidanceActive).toBe(true);
        });

        it('emergency avoidance at emergency distance (< 80px)', () => {
            const [a, b] = addPair(
                { x: 0, y: 0, speed: 3 },
                { x: 60, y: 0, speed: 3 }
            );
            const handler = vi.fn();
            cs.on('warning', handler);
            cs.update(16);
            expect(handler).toHaveBeenCalled();
            expect(handler.mock.calls[0][0].level).toBe('emergency');
        });

        it('crash at crash distance (< 15px) — both aircraft removed', () => {
            const [a, b] = addPair({ x: 0, y: 0 }, { x: 10, y: 0 });
            const crashHandler = vi.fn();
            cs.on('crash', crashHandler);
            cs.update(16);
            expect(crashHandler).toHaveBeenCalledTimes(1);
            expect(sm.aircraft).toHaveLength(0); // both removed
        });
    });

    // ─── Exclusion Rules ─────────────────────────────────────────────────

    describe('exclusion rules', () => {
        it('skips ground-air pairs', () => {
            const ac1 = createAircraft({ x: 0, y: 0 });
            ac1.state = AircraftState.APPROACHING;
            ac1.assignedRunway = 1;
            const ac2 = createAircraft({ x: 10, y: 0 });
            ac2.state = AircraftState.LANDED;
            sm.addAircraft(ac1);
            sm.addAircraft(ac2);

            const crashHandler = vi.fn();
            cs.on('crash', crashHandler);
            cs.update(16);
            expect(crashHandler).not.toHaveBeenCalled();
        });

        it('skips gate/boarding aircraft', () => {
            const ac1 = createAircraft({ x: 0, y: 0 });
            ac1.state = AircraftState.AT_GATE;
            const ac2 = createAircraft({ x: 5, y: 0 });
            ac2.state = AircraftState.APPROACHING;
            ac2.assignedRunway = 1;
            sm.addAircraft(ac1);
            sm.addAircraft(ac2);

            const crashHandler = vi.fn();
            cs.on('crash', crashHandler);
            cs.update(16);
            expect(crashHandler).not.toHaveBeenCalled();
        });

        it('skips ground taxiing pairs', () => {
            const ac1 = createAircraft({ x: 0, y: 0 });
            ac1.state = AircraftState.TAXIING_TO_GATE;
            const ac2 = createAircraft({ x: 5, y: 0 });
            ac2.state = AircraftState.TAXIING_TO_GATE;
            sm.addAircraft(ac1);
            sm.addAircraft(ac2);

            const crashHandler = vi.fn();
            cs.on('crash', crashHandler);
            cs.update(16);
            expect(crashHandler).not.toHaveBeenCalled();
        });

        it('aircraft on different runways only crash-detect', () => {
            const [a, b] = addPair(
                { x: 0, y: 0, assignedRunway: 1 },
                { x: 120, y: 0, assignedRunway: 2 }
            );
            // Distance 120 would normally trigger avoidance, but different runways skip it
            cs.update(16);
            expect(a.collisionAvoidanceActive).toBe(false);
            expect(cs.getWarnings()).toHaveLength(0);
        });

        it('aircraft awaiting assignment skip warnings but detect crashes', () => {
            const ac1 = createAircraft({ x: 0, y: 0, assignedRunway: null });
            const ac2 = createAircraft({ x: 10, y: 0, assignedRunway: 1 });
            sm.addAircraft(ac1);
            sm.addAircraft(ac2);

            const crashHandler = vi.fn();
            cs.on('crash', crashHandler);
            cs.update(16);
            expect(crashHandler).toHaveBeenCalledTimes(1);
        });
    });

    // ─── Emergency: Both Landing ─────────────────────────────────────────

    describe('emergency: both landing', () => {
        it('one aircraft goes around (higher fuel goes around)', () => {
            const ac1 = createAircraft({ x: 0, y: 0, fuel: 80 });
            ac1.state = AircraftState.LANDING;
            ac1.assignedRunway = 1;
            const ac2 = createAircraft({ x: 50, y: 0, fuel: 30 });
            ac2.state = AircraftState.LANDING;
            ac2.assignedRunway = 1;
            sm.addAircraft(ac1);
            sm.addAircraft(ac2);

            const goAroundHandler = vi.fn();
            cs.on('go_around_collision', goAroundHandler);
            cs.update(16);
            // Higher fuel (ac1=80) should go around
            expect(ac1.state).toBe(AircraftState.GO_AROUND);
            expect(goAroundHandler).toHaveBeenCalled();
        });
    });

    // ─── Warning Lifecycle ───────────────────────────────────────────────

    describe('warning lifecycle', () => {
        it('stale warnings are cleared when pair separates', () => {
            const [a, b] = addPair({ x: 0, y: 0 }, { x: 300, y: 0 });
            cs.update(16);
            expect(cs.getWarnings()).toHaveLength(1);

            // Move them apart
            b.x = 500;
            cs.update(16);
            expect(cs.getWarnings()).toHaveLength(0);
        });
    });

    // ─── Crash Log ───────────────────────────────────────────────────────

    describe('crash log', () => {
        it('records crash in crashLog', () => {
            addPair({ x: 0, y: 0 }, { x: 5, y: 0 });
            cs.update(16);
            expect(cs.getCrashCount()).toBe(1);
            expect(cs.getCrashLog()).toHaveLength(1);
            expect(cs.getCrashLog()[0].type).toBe('collision');
        });
    });
});
