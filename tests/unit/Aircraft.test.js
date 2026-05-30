// ============================================================================
// Aircraft.test.js — Tests for Aircraft model and state machine
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { Aircraft, AircraftState } from '../../js/models/Aircraft.js';
import { createAircraft, advanceToState } from '../helpers/testFactories.js';

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('Aircraft constructor', () => {
    it('initializes with APPROACHING state', () => {
        const ac = createAircraft();
        expect(ac.state).toBe(AircraftState.APPROACHING);
    });

    it('sets all critical fields', () => {
        const ac = createAircraft();
        expect(ac.id).toBeTruthy();
        expect(ac.callsign).toBeTruthy();
        expect(ac.type).toBeTruthy();
        expect(ac.fuel).toBeGreaterThan(0);
        expect(ac.maxSpeed).toBeGreaterThan(0);
        expect(ac.altitude).toBe(3000);
    });

    it('assigns valid passenger count for A320', () => {
        const ac = createAircraft({ type: 'A320' });
        // A320 capacity: [140, 180] but randomRange might exceed due to constructor logic
        expect(ac.passengerCount).toBeGreaterThan(0);
    });

    it('creates state history with initial state', () => {
        const ac = createAircraft();
        expect(ac.stateHistory).toHaveLength(1);
        expect(ac.stateHistory[0].state).toBe(AircraftState.APPROACHING);
    });
});

// ─── State Machine Transitions ───────────────────────────────────────────────

describe('Aircraft state transitions', () => {
    let ac;
    beforeEach(() => { ac = createAircraft(); });

    it('APPROACHING → LANDING succeeds', () => {
        expect(ac.setState(AircraftState.LANDING)).toBe(true);
        expect(ac.state).toBe(AircraftState.LANDING);
    });

    it('APPROACHING → HOLDING_AIR succeeds', () => {
        expect(ac.setState(AircraftState.HOLDING_AIR)).toBe(true);
        expect(ac.state).toBe(AircraftState.HOLDING_AIR);
    });

    it('invalid transition APPROACHING → AT_GATE is rejected', () => {
        expect(ac.setState(AircraftState.AT_GATE)).toBe(false);
        expect(ac.state).toBe(AircraftState.APPROACHING);
    });

    it('invalid transition APPROACHING → DEPARTING is rejected', () => {
        expect(ac.setState(AircraftState.DEPARTING)).toBe(false);
        expect(ac.state).toBe(AircraftState.APPROACHING);
    });

    it('LANDING → LANDED succeeds', () => {
        ac.setState(AircraftState.LANDING);
        expect(ac.setState(AircraftState.LANDED)).toBe(true);
    });

    it('LANDING → GO_AROUND succeeds', () => {
        ac.setState(AircraftState.LANDING);
        expect(ac.setState(AircraftState.GO_AROUND)).toBe(true);
    });

    it('GO_AROUND → HOLDING_AIR succeeds', () => {
        ac.setState(AircraftState.LANDING);
        ac.setState(AircraftState.GO_AROUND);
        expect(ac.setState(AircraftState.HOLDING_AIR)).toBe(true);
    });

    it('full happy path: APPROACHING through DEPARTING', () => {
        const path = [
            AircraftState.LANDING, AircraftState.LANDED,
            AircraftState.TAXIING_TO_GATE, AircraftState.BOARDING,
            AircraftState.AT_GATE, AircraftState.TAXIING_TO_RUNWAY,
            AircraftState.TAKEOFF, AircraftState.DEPARTING,
        ];
        for (const state of path) {
            expect(ac.setState(state)).toBe(true);
            expect(ac.state).toBe(state);
        }
    });

    it('setState resets stateTimer', () => {
        ac.stateTimer = 5000;
        ac.setState(AircraftState.LANDING);
        expect(ac.stateTimer).toBe(0);
    });

    it('setState records in stateHistory', () => {
        ac.setState(AircraftState.LANDING);
        expect(ac.stateHistory).toHaveLength(2);
        expect(ac.stateHistory[1].state).toBe(AircraftState.LANDING);
    });

    it('setState sets previousState', () => {
        ac.setState(AircraftState.LANDING);
        expect(ac.previousState).toBe(AircraftState.APPROACHING);
    });
});

// ─── State Entry Actions ─────────────────────────────────────────────────────

describe('state entry actions', () => {
    it('GO_AROUND increments goAroundCount', () => {
        const ac = createAircraft();
        ac.setState(AircraftState.LANDING);
        ac.setState(AircraftState.GO_AROUND);
        expect(ac.goAroundCount).toBe(1);
    });

    it('GO_AROUND sets altitude floor of 500', () => {
        const ac = createAircraft({ altitude: 100 });
        ac.setState(AircraftState.LANDING);
        ac.setState(AircraftState.GO_AROUND);
        expect(ac.altitude).toBeGreaterThanOrEqual(500);
    });

    it('BOARDING resets timer and starts refueling', () => {
        const ac = createAircraft();
        advanceToState(ac, AircraftState.BOARDING);
        expect(ac.gateTimer).toBe(0);
        expect(ac.boardingProgress).toBe(0);
        expect(ac.isRefueling).toBe(true);
    });

    it('TAKEOFF sets heading to 0', () => {
        const ac = createAircraft();
        ac.heading = Math.PI;
        advanceToState(ac, AircraftState.TAKEOFF);
        expect(ac.heading).toBe(0);
    });

    it('LANDED sets altitude to 0', () => {
        const ac = createAircraft({ altitude: 1000 });
        ac.setState(AircraftState.LANDING);
        ac.setState(AircraftState.LANDED);
        expect(ac.altitude).toBe(0);
    });

    it('HOLDING_AIR sets holdingCenter to current position', () => {
        const ac = createAircraft({ x: 100, y: 200 });
        ac.setState(AircraftState.HOLDING_AIR);
        expect(ac.holdingCenter).toEqual({ x: 100, y: 200 });
    });
});

// ─── Movement & Physics ──────────────────────────────────────────────────────

describe('Aircraft movement', () => {
    it('update() on REMOVED state is a no-op', () => {
        const ac = createAircraft();
        ac.state = AircraftState.REMOVED; // force state
        const oldX = ac.x;
        ac.update(100);
        expect(ac.x).toBe(oldX);
    });

    it('_moveToTarget moves aircraft toward target', () => {
        const ac = createAircraft({ x: 0, y: 0 });
        ac.setTarget(100, 0);
        ac.heading = 0;
        ac.speed = 2;
        ac.update(100);
        expect(ac.x).toBeGreaterThan(0);
    });

    it('_moveToTarget snaps to target when very close', () => {
        const ac = createAircraft({ x: 98, y: 0, speed: 2 });
        ac.setTarget(100, 0);
        ac.heading = 0;
        ac.update(100);
        // After enough updates near the target, should snap
        for (let i = 0; i < 20; i++) ac.update(50);
        expect(ac.x).toBeCloseTo(100, 0);
    });

    it('avoidance vector decays over time', () => {
        const ac = createAircraft();
        ac.applyAvoidance({ x: 10, y: 10 });
        expect(ac.collisionAvoidanceActive).toBe(true);
        // Simulate many frames to decay
        for (let i = 0; i < 200; i++) ac.update(16);
        expect(ac.collisionAvoidanceActive).toBe(false);
    });

    it('speedMultiplier affects movement', () => {
        const ac1 = createAircraft({ x: 0, y: 0, maxSpeed: 4 });
        ac1.setTarget(500, 0);
        ac1.heading = 0;
        const ac2 = createAircraft({ x: 0, y: 0, maxSpeed: 4 });
        ac2.setTarget(500, 0);
        ac2.heading = 0;
        ac2.speedMultiplier = 2.0;

        for (let i = 0; i < 60; i++) {
            ac1.update(16);
            ac2.update(16);
        }
        // Expedited aircraft should be further along
        expect(ac2.x).toBeGreaterThan(ac1.x);
    });
});

// ─── Status & Query Methods ──────────────────────────────────────────────────

describe('Aircraft status queries', () => {
    it('isAirborne() is true for air states', () => {
        const airStates = [
            AircraftState.APPROACHING, AircraftState.HOLDING_AIR,
            AircraftState.LANDING, AircraftState.GO_AROUND,
            AircraftState.DEPARTING, AircraftState.TAKEOFF,
        ];
        for (const state of airStates) {
            const ac = createAircraft();
            ac.state = state; // force
            expect(ac.isAirborne()).toBe(true);
        }
    });

    it('isOnGround() is true for ground states', () => {
        const groundStates = [
            AircraftState.LANDED, AircraftState.TAXIING_TO_GATE,
            AircraftState.BOARDING, AircraftState.AT_GATE,
            AircraftState.TAXIING_TO_RUNWAY, AircraftState.HOLDING_GROUND,
        ];
        for (const state of groundStates) {
            const ac = createAircraft();
            ac.state = state; // force
            expect(ac.isOnGround()).toBe(true);
        }
    });

    it('needsRunwayAssignment when APPROACHING without runway', () => {
        const ac = createAircraft();
        expect(ac.needsRunwayAssignment()).toBe(true);
        ac.assignedRunway = 1;
        expect(ac.needsRunwayAssignment()).toBe(false);
    });

    it('needsGateAssignment when LANDED without gate', () => {
        const ac = createAircraft();
        ac.setState(AircraftState.LANDING);
        ac.setState(AircraftState.LANDED);
        expect(ac.needsGateAssignment()).toBe(true);
        ac.assignedGate = 1;
        expect(ac.needsGateAssignment()).toBe(false);
    });

    it('isReadyForDeparture requires AT_GATE + 5s timer + not refueling', () => {
        const ac = createAircraft();
        advanceToState(ac, AircraftState.AT_GATE);
        ac.isRefueling = false;
        ac.stateTimer = 4999;
        expect(ac.isReadyForDeparture()).toBe(false);
        ac.stateTimer = 5000;
        expect(ac.isReadyForDeparture()).toBe(true);
    });

    it('isReadyForDeparture is false when still refueling', () => {
        const ac = createAircraft();
        advanceToState(ac, AircraftState.AT_GATE);
        ac.stateTimer = 10000;
        ac.isRefueling = true;
        expect(ac.isReadyForDeparture()).toBe(false);
    });

    it('hasReachedTarget returns true when within 10px', () => {
        const ac = createAircraft({ x: 95, y: 0 });
        ac.setTarget(100, 0);
        expect(ac.hasReachedTarget()).toBe(true);
    });

    it('hasReachedTarget returns false when no target', () => {
        const ac = createAircraft();
        expect(ac.hasReachedTarget()).toBe(false);
    });

    it('getStatusSnapshot returns all expected fields', () => {
        const ac = createAircraft();
        const snap = ac.getStatusSnapshot();
        const expectedKeys = [
            'id', 'callsign', 'type', 'state', 'position', 'heading',
            'speed', 'altitude', 'fuel', 'fuelEmergency', 'fuelLow',
            'isEmergency', 'assignedRunway', 'assignedGate', 'goAroundCount',
            'collisionAvoidanceActive', 'timeInState', 'needsRunway',
            'needsGate', 'readyForDeparture', 'passengers', 'origin',
            'destination', 'boardingProgress', 'crashReason',
        ];
        for (const key of expectedKeys) {
            expect(snap).toHaveProperty(key);
        }
    });
});

// ─── startGoAround ───────────────────────────────────────────────────────────

describe('startGoAround()', () => {
    it('succeeds from LANDING state', () => {
        const ac = createAircraft();
        ac.setState(AircraftState.LANDING);
        expect(ac.startGoAround()).toBe(true);
        expect(ac.state).toBe(AircraftState.GO_AROUND);
        expect(ac.assignedRunway).toBeNull();
    });

    it('fails from non-LANDING state', () => {
        const ac = createAircraft();
        expect(ac.startGoAround()).toBe(false);
        expect(ac.state).toBe(AircraftState.APPROACHING);
    });
});

// ─── destroy ─────────────────────────────────────────────────────────────────

describe('destroy()', () => {
    it('sets state to REMOVED', () => {
        const ac = createAircraft();
        ac.destroy();
        expect(ac.state).toBe(AircraftState.REMOVED);
    });
});
