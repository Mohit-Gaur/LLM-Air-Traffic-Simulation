// ============================================================================
// Test Factories — Deterministic fixture creation for tests
// ============================================================================

import { Aircraft, AircraftState } from '../../js/models/Aircraft.js';
import { StateManager } from '../../js/engine/StateManager.js';

/**
 * Create an Aircraft with deterministic overrides for testing.
 * Accepts any Aircraft property as an override.
 */
export function createAircraft(overrides = {}) {
    const ac = new Aircraft();
    // Apply overrides
    for (const [key, value] of Object.entries(overrides)) {
        ac[key] = value;
    }
    return ac;
}

/**
 * Create a pre-configured StateManager with the default airport layout.
 */
export function createStateManager() {
    return new StateManager();
}

/**
 * Create a mock simulation snapshot for AI testing.
 */
export function createSnapshot(overrides = {}) {
    const base = {
        aircraft: [],
        runways: [
            { id: 1, label: 'RWY 09L', occupied: false, occupiedBy: null },
            { id: 2, label: 'RWY 09R', occupied: false, occupiedBy: null },
        ],
        gates: [
            { id: 1, occupied: false, occupiedBy: null },
            { id: 2, occupied: false, occupiedBy: null },
            { id: 3, occupied: false, occupiedBy: null },
            { id: 4, occupied: false, occupiedBy: null },
            { id: 5, occupied: false, occupiedBy: null },
            { id: 6, occupied: false, occupiedBy: null },
        ],
        counts: { total: 0, airborne: 0, ground: 0, freeRunways: 2, freeGates: 6 },
        safetyContext: {
            totalCrashes: 0, recentCrashes: [],
            fuelEmergencyCount: 0, lowFuelCount: 0,
        },
        collisionWarnings: [],
    };
    return { ...base, ...overrides };
}

/**
 * Create a mock aircraft entry for use in snapshots (not a real Aircraft instance).
 */
export function createSnapshotAircraft(overrides = {}) {
    return {
        id: overrides.id || 'test-ac-1',
        callsign: overrides.callsign || 'TST100',
        type: 'A320',
        state: AircraftState.APPROACHING,
        fuel: 60,
        fuelEmergency: false,
        fuelLow: false,
        isEmergency: false,
        assignedRunway: null,
        assignedGate: null,
        needsRunway: true,
        needsGate: false,
        readyForDeparture: false,
        timeInState: 0,
        goAroundCount: 0,
        passengers: 150,
        origin: 'JFK',
        destination: 'LAX',
        boardingProgress: 0,
        ...overrides,
    };
}

/**
 * Advance an aircraft to a specific state by walking through valid transitions.
 * Useful for setting up test preconditions.
 */
const STATE_PATH = [
    AircraftState.APPROACHING,
    AircraftState.LANDING,
    AircraftState.LANDED,
    AircraftState.TAXIING_TO_GATE,
    AircraftState.BOARDING,
    AircraftState.AT_GATE,
    AircraftState.TAXIING_TO_RUNWAY,
    AircraftState.TAKEOFF,
    AircraftState.DEPARTING,
];

export function advanceToState(ac, targetState) {
    const targetIdx = STATE_PATH.indexOf(targetState);
    if (targetIdx === -1) {
        // Handle non-linear states
        if (targetState === AircraftState.HOLDING_AIR) {
            ac.setState(AircraftState.HOLDING_AIR);
            return ac;
        }
        if (targetState === AircraftState.GO_AROUND) {
            ac.setState(AircraftState.LANDING);
            ac.setState(AircraftState.GO_AROUND);
            return ac;
        }
        if (targetState === AircraftState.HOLDING_GROUND) {
            advanceToState(ac, AircraftState.TAXIING_TO_RUNWAY);
            ac.setState(AircraftState.HOLDING_GROUND);
            return ac;
        }
        throw new Error(`Cannot advance to state: ${targetState}`);
    }

    const currentIdx = STATE_PATH.indexOf(ac.state);
    if (currentIdx === -1) throw new Error(`Cannot advance from state: ${ac.state}`);

    for (let i = currentIdx + 1; i <= targetIdx; i++) {
        ac.setState(STATE_PATH[i]);
    }
    return ac;
}
