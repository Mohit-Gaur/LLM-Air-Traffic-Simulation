// ============================================================================
// StateManager.test.js — Tests for aircraft lifecycle and state transitions
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateManager } from '../../js/engine/StateManager.js';
import { AircraftState } from '../../js/models/Aircraft.js';
import { createAircraft, advanceToState } from '../helpers/testFactories.js';

describe('StateManager', () => {
    let sm;

    beforeEach(() => {
        sm = new StateManager();
    });

    // ─── Initialization ──────────────────────────────────────────────────

    describe('initialization', () => {
        it('creates runways from config', () => {
            expect(sm.runways).toHaveLength(2);
            expect(sm.runways[0].label).toBe('RWY 09L');
            expect(sm.runways[1].label).toBe('RWY 09R');
        });

        it('creates gates from config', () => {
            expect(sm.gates).toHaveLength(6);
        });

        it('runways start unoccupied', () => {
            for (const rw of sm.runways) {
                expect(rw.occupied).toBe(false);
                expect(rw.occupiedBy).toBeNull();
            }
        });
    });

    // ─── Add / Remove ────────────────────────────────────────────────────

    describe('addAircraft / removeAircraft', () => {
        it('addAircraft appends to array and emits event', () => {
            const handler = vi.fn();
            sm.on('aircraft_added', handler);
            const ac = createAircraft();
            sm.addAircraft(ac);
            expect(sm.aircraft).toHaveLength(1);
            expect(handler).toHaveBeenCalledWith(ac);
        });

        it('removeAircraft releases runway and gate', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            ac.assignedRunway = 1;
            ac.assignedGate = 1;
            sm.runways[0].occupied = true;
            sm.runways[0].occupiedBy = ac.id;
            sm.gates[0].occupied = true;
            sm.gates[0].occupiedBy = ac.id;

            sm.removeAircraft(ac);
            expect(sm.aircraft).toHaveLength(0);
            expect(sm.runways[0].occupied).toBe(false);
            expect(sm.gates[0].occupied).toBe(false);
        });

        it('removeAircraft emits aircraft_removed event', () => {
            const handler = vi.fn();
            sm.on('aircraft_removed', handler);
            const ac = createAircraft();
            sm.addAircraft(ac);
            sm.removeAircraft(ac);
            expect(handler).toHaveBeenCalledWith(ac);
        });
    });

    // ─── assignRunway ────────────────────────────────────────────────────

    describe('assignRunway', () => {
        it('assigns runway and sets target for APPROACHING aircraft', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            const result = sm.assignRunway(ac.id, 1);
            expect(result).toBe(true);
            expect(ac.assignedRunway).toBe(1);
            expect(ac.targetX).toBe(sm.runways[0].x + sm.runways[0].length);
            expect(ac.targetY).toBe(sm.runways[0].y);
        });

        it('returns false for invalid aircraft ID', () => {
            expect(sm.assignRunway('nonexistent', 1)).toBe(false);
        });

        it('returns false for invalid runway ID', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            expect(sm.assignRunway(ac.id, 999)).toBe(false);
        });
    });

    // ─── assignGate ──────────────────────────────────────────────────────

    describe('assignGate', () => {
        it('marks gate as occupied', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            const result = sm.assignGate(ac.id, 1);
            expect(result).toBe(true);
            expect(ac.assignedGate).toBe(1);
            expect(sm.gates[0].occupied).toBe(true);
            expect(sm.gates[0].occupiedBy).toBe(ac.id);
        });

        it('fails if gate already occupied', () => {
            const ac1 = createAircraft(), ac2 = createAircraft();
            sm.addAircraft(ac1);
            sm.addAircraft(ac2);
            sm.assignGate(ac1.id, 1);
            expect(sm.assignGate(ac2.id, 1)).toBe(false);
        });
    });

    // ─── startDeparture ──────────────────────────────────────────────────

    describe('startDeparture', () => {
        it('works from AT_GATE state', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            advanceToState(ac, AircraftState.AT_GATE);
            ac.assignedGate = 1;
            sm.gates[0].occupied = true;
            sm.gates[0].occupiedBy = ac.id;

            const result = sm.startDeparture(ac.id, 1);
            expect(result).toBe(true);
            expect(ac.state).toBe(AircraftState.TAXIING_TO_RUNWAY);
            expect(ac.assignedRunway).toBe(1);
            expect(sm.gates[0].occupied).toBe(false); // gate released
        });

        it('fails from non-AT_GATE state', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            expect(sm.startDeparture(ac.id, 1)).toBe(false);
        });
    });

    // ─── holdAircraft ────────────────────────────────────────────────────

    describe('holdAircraft', () => {
        it('APPROACHING → HOLDING_AIR', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            expect(sm.holdAircraft(ac.id)).toBe(true);
            expect(ac.state).toBe(AircraftState.HOLDING_AIR);
        });

        it('fails for invalid state (e.g., LANDED)', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            advanceToState(ac, AircraftState.LANDED);
            expect(sm.holdAircraft(ac.id)).toBe(false);
        });
    });

    // ─── clearHold ───────────────────────────────────────────────────────

    describe('clearHold', () => {
        it('HOLDING_AIR → APPROACHING with target set', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            ac.setState(AircraftState.HOLDING_AIR);
            ac.assignedRunway = 1;
            expect(sm.clearHold(ac.id)).toBe(true);
            expect(ac.state).toBe(AircraftState.APPROACHING);
            expect(ac.targetX).toBe(sm.runways[0].x + sm.runways[0].length);
        });

        it('HOLDING_AIR without assigned runway fails', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            ac.setState(AircraftState.HOLDING_AIR);
            expect(sm.clearHold(ac.id)).toBe(false);
        });

        it('HOLDING_GROUND → TAKEOFF when runway is free', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            advanceToState(ac, AircraftState.TAXIING_TO_RUNWAY);
            ac.setState(AircraftState.HOLDING_GROUND);
            ac.assignedRunway = 1;
            expect(sm.clearHold(ac.id)).toBe(true);
            expect(ac.state).toBe(AircraftState.TAKEOFF);
            expect(sm.runways[0].occupied).toBe(true);
        });

        it('HOLDING_GROUND fails when runway is occupied', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            advanceToState(ac, AircraftState.TAXIING_TO_RUNWAY);
            ac.setState(AircraftState.HOLDING_GROUND);
            ac.assignedRunway = 1;
            sm.runways[0].occupied = true;
            expect(sm.clearHold(ac.id)).toBe(false);
        });
    });

    // ─── releaseRunway / releaseGate ─────────────────────────────────────

    describe('resource release', () => {
        it('releaseRunway only releases if owner matches', () => {
            sm.runways[0].occupied = true;
            sm.runways[0].occupiedBy = 'owner-1';
            sm.releaseRunway(1, 'wrong-owner');
            expect(sm.runways[0].occupied).toBe(true);
            sm.releaseRunway(1, 'owner-1');
            expect(sm.runways[0].occupied).toBe(false);
        });

        it('releaseGate only releases if owner matches', () => {
            sm.gates[0].occupied = true;
            sm.gates[0].occupiedBy = 'owner-1';
            sm.releaseGate(1, 'wrong-owner');
            expect(sm.gates[0].occupied).toBe(true);
            sm.releaseGate(1, 'owner-1');
            expect(sm.gates[0].occupied).toBe(false);
        });
    });

    // ─── update() — boundary removal ─────────────────────────────────────

    describe('update() boundary removal', () => {
        it('removes departed aircraft past x=1300', () => {
            const ac = createAircraft({ x: 1301 });
            sm.addAircraft(ac);
            ac.state = AircraftState.DEPARTING;
            const handler = vi.fn();
            sm.on('aircraft_departed', handler);
            sm.update(16);
            expect(sm.aircraft).toHaveLength(0);
            expect(handler).toHaveBeenCalled();
        });

        it('removes lost approaching aircraft at x < -100', () => {
            const ac = createAircraft({ x: -101 });
            sm.addAircraft(ac);
            sm.update(16);
            expect(sm.aircraft).toHaveLength(0);
        });
    });

    // ─── _processTransitions ─────────────────────────────────────────────

    describe('_processTransitions', () => {
        it('APPROACHING → LANDING when target reached with assigned runway', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            sm.assignRunway(ac.id, 1);
            // Set position at the target
            ac.x = ac.targetX;
            ac.y = ac.targetY;
            sm._processTransitions(ac);
            expect(ac.state).toBe(AircraftState.LANDING);
            expect(sm.runways[0].occupied).toBe(true);
        });

        it('LANDING → LANDED when target reached', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            ac.setState(AircraftState.LANDING);
            ac.setTarget(100, 100);
            ac.x = 100;
            ac.y = 100;
            const handler = vi.fn();
            sm.on('aircraft_landed', handler);
            sm._processTransitions(ac);
            expect(ac.state).toBe(AircraftState.LANDED);
            expect(handler).toHaveBeenCalled();
        });

        it('BOARDING → AT_GATE when boardingProgress >= 1', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            advanceToState(ac, AircraftState.BOARDING);
            ac.boardingProgress = 1.0;
            sm._processTransitions(ac);
            expect(ac.state).toBe(AircraftState.AT_GATE);
        });
    });

    // ─── Query methods ───────────────────────────────────────────────────

    describe('query methods', () => {
        it('getAircraft finds by ID', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            expect(sm.getAircraft(ac.id)).toBe(ac);
        });

        it('getAircraftByCallsign finds by callsign', () => {
            const ac = createAircraft();
            sm.addAircraft(ac);
            expect(sm.getAircraftByCallsign(ac.callsign)).toBe(ac);
        });

        it('getFreeRunways returns unoccupied runways', () => {
            expect(sm.getFreeRunways()).toHaveLength(2);
            sm.runways[0].occupied = true;
            expect(sm.getFreeRunways()).toHaveLength(1);
        });

        it('getFreeGates returns unoccupied gates', () => {
            expect(sm.getFreeGates()).toHaveLength(6);
        });
    });

    // ─── recordCrash ─────────────────────────────────────────────────────

    describe('recordCrash', () => {
        it('stores crash info', () => {
            sm.recordCrash({ type: 'collision', reason: 'test' });
            expect(sm.crashHistory).toHaveLength(1);
        });

        it('caps history at 20', () => {
            for (let i = 0; i < 25; i++) {
                sm.recordCrash({ type: 'collision', index: i });
            }
            expect(sm.crashHistory).toHaveLength(20);
            // Oldest should have been dropped
            expect(sm.crashHistory[0].index).toBe(5);
        });
    });

    // ─── getSnapshot ─────────────────────────────────────────────────────

    describe('getSnapshot', () => {
        it('includes all top-level keys', () => {
            const snap = sm.getSnapshot();
            expect(snap).toHaveProperty('aircraft');
            expect(snap).toHaveProperty('runways');
            expect(snap).toHaveProperty('gates');
            expect(snap).toHaveProperty('counts');
            expect(snap).toHaveProperty('safetyContext');
            expect(snap).toHaveProperty('collisionWarnings');
        });

        it('includes safety context with crash info', () => {
            sm.recordCrash({ type: 'collision', aircraftA: { callsign: 'A' }, aircraftB: { callsign: 'B' } });
            const snap = sm.getSnapshot();
            expect(snap.safetyContext.totalCrashes).toBe(1);
            expect(snap.safetyContext.recentCrashes).toHaveLength(1);
        });
    });
});
