// ============================================================================
// aircraft-lifecycle.test.js — Full aircraft lifecycle integration test
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateManager } from '../../js/engine/StateManager.js';
import { AircraftState } from '../../js/models/Aircraft.js';
import { createAircraft } from '../helpers/testFactories.js';

describe('Integration: Aircraft Lifecycle', () => {
    let sm;

    beforeEach(() => {
        sm = new StateManager();
    });

    it('full happy path: approach → assign runway → land → assign gate → taxi → board → depart', () => {
        const ac = createAircraft();
        sm.addAircraft(ac);

        // 1. Assign runway
        sm.assignRunway(ac.id, 1);
        expect(ac.assignedRunway).toBe(1);
        expect(ac.targetX).toBe(sm.runways[0].x + sm.runways[0].length);

        // 2. Simulate reaching the approach target → transition to LANDING
        ac.x = ac.targetX;
        ac.y = ac.targetY;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.LANDING);
        expect(sm.runways[0].occupied).toBe(true);

        // 3. Set new target (runway start) and reach it → LANDED
        ac.x = sm.runways[0].x;
        ac.y = sm.runways[0].y;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.LANDED);

        // 4. Assign gate
        sm.assignGate(ac.id, 1);
        expect(ac.assignedGate).toBe(1);
        expect(sm.gates[0].occupied).toBe(true);

        // 5. Process transition → releases runway, sets taxi target, TAXIING_TO_GATE
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.TAXIING_TO_GATE);
        expect(sm.runways[0].occupied).toBe(false); // runway released

        // 6. Reach gate → BOARDING
        ac.x = sm.gates[0].x;
        ac.y = sm.gates[0].y;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.BOARDING);

        // 7. Complete boarding → AT_GATE
        ac.boardingProgress = 1.0;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.AT_GATE);

        // 8. Start departure
        sm.startDeparture(ac.id, 2);
        expect(ac.state).toBe(AircraftState.TAXIING_TO_RUNWAY);
        expect(ac.assignedRunway).toBe(2);
        expect(sm.gates[0].occupied).toBe(false); // gate released

        // 9. Reach runway → TAKEOFF (runway free)
        ac.x = sm.runways[1].x;
        ac.y = sm.runways[1].y;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.TAKEOFF);
        expect(sm.runways[1].occupied).toBe(true);

        // 10. Reach end of runway → DEPARTING
        ac.x = sm.runways[1].x + sm.runways[1].length;
        ac.y = sm.runways[1].y;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.DEPARTING);
        expect(sm.runways[1].occupied).toBe(false); // runway released

        // 11. Move past boundary → removed by update()
        ac.x = 1301;
        const departHandler = vi.fn();
        sm.on('aircraft_departed', departHandler);
        sm.update(16);
        expect(sm.aircraft).toHaveLength(0);
        expect(departHandler).toHaveBeenCalled();
    });

    it('go-around recovery: land attempt → go-around → re-hold → reassign → land', () => {
        const ac = createAircraft();
        sm.addAircraft(ac);

        // Assign runway and start landing
        sm.assignRunway(ac.id, 1);
        ac.x = ac.targetX;
        ac.y = ac.targetY;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.LANDING);

        // Go around
        ac.startGoAround();
        expect(ac.state).toBe(AircraftState.GO_AROUND);
        expect(ac.assignedRunway).toBeNull();
        expect(ac.goAroundCount).toBe(1);

        // Transition to holding after go-around timer
        ac.stateTimer = 4000;
        ac.update(100); // trigger GO_AROUND movement check
        expect(ac.state).toBe(AircraftState.HOLDING_AIR);

        // Reassign runway
        sm.assignRunway(ac.id, 2);
        sm.clearHold(ac.id);
        expect(ac.state).toBe(AircraftState.APPROACHING);

        // Reach new target → LANDING
        ac.x = ac.targetX;
        ac.y = ac.targetY;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.LANDING);

        // Complete landing
        ac.x = sm.runways[1].x;
        ac.y = sm.runways[1].y;
        sm._processTransitions(ac);
        expect(ac.state).toBe(AircraftState.LANDED);
    });

    it('runway released after takeoff, gate released after departure start', () => {
        const ac = createAircraft();
        sm.addAircraft(ac);

        // Get to AT_GATE with gate assigned
        sm.assignRunway(ac.id, 1);
        ac.x = ac.targetX; ac.y = ac.targetY;
        sm._processTransitions(ac); // → LANDING
        ac.x = sm.runways[0].x; ac.y = sm.runways[0].y;
        sm._processTransitions(ac); // → LANDED
        sm.assignGate(ac.id, 3);
        sm._processTransitions(ac); // → TAXIING_TO_GATE
        ac.x = sm.gates[2].x; ac.y = sm.gates[2].y;
        sm._processTransitions(ac); // → BOARDING
        ac.boardingProgress = 1.0;
        sm._processTransitions(ac); // → AT_GATE

        expect(sm.gates[2].occupied).toBe(true);

        // Start departure → gate released
        sm.startDeparture(ac.id, 1);
        expect(sm.gates[2].occupied).toBe(false);

        // Reach runway → TAKEOFF → runway occupied
        ac.x = sm.runways[0].x; ac.y = sm.runways[0].y;
        sm._processTransitions(ac);
        expect(sm.runways[0].occupied).toBe(true);

        // Complete takeoff → DEPARTING → runway released
        ac.x = sm.runways[0].x + sm.runways[0].length;
        ac.y = sm.runways[0].y;
        sm._processTransitions(ac);
        expect(sm.runways[0].occupied).toBe(false);
    });

    it('multiple aircraft share resources without conflict', () => {
        const ac1 = createAircraft();
        const ac2 = createAircraft();
        sm.addAircraft(ac1);
        sm.addAircraft(ac2);

        // Assign different runways
        sm.assignRunway(ac1.id, 1);
        sm.assignRunway(ac2.id, 2);

        // Both land
        ac1.x = ac1.targetX; ac1.y = ac1.targetY;
        ac2.x = ac2.targetX; ac2.y = ac2.targetY;
        sm._processTransitions(ac1);
        sm._processTransitions(ac2);

        expect(ac1.state).toBe(AircraftState.LANDING);
        expect(ac2.state).toBe(AircraftState.LANDING);
        expect(sm.runways[0].occupiedBy).toBe(ac1.id);
        expect(sm.runways[1].occupiedBy).toBe(ac2.id);
    });
});
