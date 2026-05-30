// ============================================================================
// fuel-crash-pipeline.test.js — Fuel depletion and collision crash pipelines
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateManager } from '../../js/engine/StateManager.js';
import { FuelSystem } from '../../js/engine/FuelSystem.js';
import { CollisionSystem } from '../../js/engine/CollisionSystem.js';
import { AircraftState } from '../../js/models/Aircraft.js';
import { createAircraft } from '../helpers/testFactories.js';

describe('Integration: Fuel + Crash Pipeline', () => {
    let sm, fs, cs;

    beforeEach(() => {
        sm = new StateManager();
        fs = new FuelSystem(sm);
        cs = new CollisionSystem(sm);
    });

    it('fuel depletes → emergency → auto-assigns runway', () => {
        const ac = createAircraft({ fuel: 15.5 });
        sm.addAircraft(ac);

        // Tick until fuel drops below emergency threshold
        for (let i = 0; i < 100; i++) {
            fs.update(500);
            if (ac.fuelEmergency) break;
        }

        expect(ac.fuelEmergency).toBe(true);
        expect(ac.assignedRunway).toBeTruthy();
    });

    it('fuel hits 0 airborne → fuel_exhausted event fires', () => {
        const ac = createAircraft({ fuel: 0.01 });
        sm.addAircraft(ac);

        const exhaustedHandler = vi.fn();
        fs.on('fuel_exhausted', exhaustedHandler);

        fs.update(5000);
        expect(exhaustedHandler).toHaveBeenCalled();
    });

    it('collision between two aircraft → both removed, crash logged', () => {
        const ac1 = createAircraft({ x: 100, y: 100, assignedRunway: 1 });
        const ac2 = createAircraft({ x: 105, y: 100, assignedRunway: 1 });
        sm.addAircraft(ac1);
        sm.addAircraft(ac2);

        const crashHandler = vi.fn();
        cs.on('crash', crashHandler);

        cs.update(16);

        expect(crashHandler).toHaveBeenCalledTimes(1);
        expect(sm.aircraft).toHaveLength(0);
        expect(cs.getCrashCount()).toBe(1);
    });

    it('FuelSystem runway clearing forces go-around on occupant', () => {
        // Occupy both runways with landing aircraft
        const landing1 = createAircraft({ fuel: 50, x: 600, y: 350 });
        landing1.state = AircraftState.LANDING;
        landing1.assignedRunway = 1;
        sm.addAircraft(landing1);
        sm.runways[0].occupied = true;
        sm.runways[0].occupiedBy = landing1.id;

        const landing2 = createAircraft({ fuel: 50, x: 600, y: 500 });
        landing2.state = AircraftState.LANDING;
        landing2.assignedRunway = 2;
        sm.addAircraft(landing2);
        sm.runways[1].occupied = true;
        sm.runways[1].occupiedBy = landing2.id;

        // Add emergency aircraft with critical fuel
        const emergency = createAircraft({ fuel: 10, x: 900, y: 400 });
        sm.addAircraft(emergency);

        const clearHandler = vi.fn();
        fs.on('runway_cleared', clearHandler);

        fs.update(100);

        // One of the landing aircraft should have gone around
        const goAround = sm.aircraft.filter(a => a.state === AircraftState.GO_AROUND);
        expect(goAround.length).toBeGreaterThanOrEqual(1);
        expect(clearHandler).toHaveBeenCalled();
        // Emergency aircraft should now have a runway assigned
        expect(emergency.assignedRunway).toBeTruthy();
    });

    it('ground aircraft with 0 fuel does NOT trigger fuel_exhausted', () => {
        const ac = createAircraft({ fuel: 0.01 });
        ac.state = AircraftState.LANDED;
        sm.addAircraft(ac);

        const exhaustedHandler = vi.fn();
        fs.on('fuel_exhausted', exhaustedHandler);

        fs.update(5000);
        expect(exhaustedHandler).not.toHaveBeenCalled();
    });

    it('collision system + fuel system run in same tick without errors', () => {
        // Two aircraft close together with low fuel
        const ac1 = createAircraft({ x: 100, y: 100, fuel: 10, assignedRunway: 1 });
        const ac2 = createAircraft({ x: 200, y: 100, fuel: 10, assignedRunway: 1 });
        sm.addAircraft(ac1);
        sm.addAircraft(ac2);

        // Should not throw when both systems run
        expect(() => {
            fs.update(100);
            cs.update(16);
        }).not.toThrow();
    });

    it('fuel emergency while in HOLDING_AIR transitions to APPROACHING', () => {
        const ac = createAircraft({ fuel: 14 });
        sm.addAircraft(ac);
        ac.setState(AircraftState.HOLDING_AIR);

        fs.update(100);

        expect(ac.fuelEmergency).toBe(true);
        expect(ac.state).toBe(AircraftState.APPROACHING);
        expect(ac.assignedRunway).toBeTruthy();
    });
});
