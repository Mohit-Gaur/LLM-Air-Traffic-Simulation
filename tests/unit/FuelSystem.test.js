// ============================================================================
// FuelSystem.test.js — Tests for fuel management and emergency detection
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FuelSystem } from '../../js/engine/FuelSystem.js';
import { StateManager } from '../../js/engine/StateManager.js';
import { AircraftState } from '../../js/models/Aircraft.js';
import { createAircraft } from '../helpers/testFactories.js';

describe('FuelSystem', () => {
    let sm, fs;

    beforeEach(() => {
        sm = new StateManager();
        fs = new FuelSystem(sm);
    });

    // ─── Fuel Consumption ────────────────────────────────────────────────

    describe('fuel consumption', () => {
        it('decreases fuel over time', () => {
            const ac = createAircraft({ fuel: 50 });
            sm.addAircraft(ac);
            fs.update(1000); // 1 second
            expect(ac.fuel).toBeLessThan(50);
        });

        it('fuel never goes below 0', () => {
            const ac = createAircraft({ fuel: 0.01 });
            sm.addAircraft(ac);
            fs.update(10000); // 10 seconds
            expect(ac.fuel).toBeGreaterThanOrEqual(0);
        });

        it('REMOVED aircraft are skipped', () => {
            const ac = createAircraft({ fuel: 50 });
            ac.state = AircraftState.REMOVED;
            sm.aircraft.push(ac); // add directly to avoid events
            fs.update(1000);
            expect(ac.fuel).toBe(50);
        });
    });

    // ─── Threshold Detection ─────────────────────────────────────────────

    describe('threshold detection', () => {
        it('fuelLow flag set at <= 25%', () => {
            const ac = createAircraft({ fuel: 26 });
            sm.addAircraft(ac);
            // Consume enough to drop below 25
            fs.update(20000); // large dt to consume fuel
            // It should eventually cross
            expect(ac.fuel).toBeLessThanOrEqual(25);
            expect(ac.fuelLow || ac.fuelEmergency).toBe(true);
        });

        it('fuelEmergency flag set at <= 15%', () => {
            const ac = createAircraft({ fuel: 14 });
            sm.addAircraft(ac);
            fs.update(100);
            expect(ac.fuelEmergency).toBe(true);
            expect(ac.isEmergency).toBe(true);
        });

        it('fuelLow is false when fuelEmergency is true', () => {
            // fuelLow = fuel <= 25 && !fuelEmergency
            const ac = createAircraft({ fuel: 10 });
            sm.addAircraft(ac);
            fs.update(100);
            expect(ac.fuelEmergency).toBe(true);
            expect(ac.fuelLow).toBe(false);
        });
    });

    // ─── Event Emission ──────────────────────────────────────────────────

    describe('event emission', () => {
        it('fuel_emergency fires on transition to emergency', () => {
            const ac = createAircraft({ fuel: 15.5 });
            sm.addAircraft(ac);
            const handler = vi.fn();
            fs.on('fuel_emergency', handler);

            // First tick — above threshold
            fs.update(100);
            if (ac.fuel > 15) {
                expect(handler).not.toHaveBeenCalled();
            }

            // Keep ticking until emergency
            for (let i = 0; i < 200; i++) {
                fs.update(500);
                if (ac.fuelEmergency) break;
            }
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('fuel_emergency does not fire repeatedly', () => {
            const ac = createAircraft({ fuel: 14 });
            sm.addAircraft(ac);
            const handler = vi.fn();
            fs.on('fuel_emergency', handler);
            fs.update(100);
            fs.update(100);
            fs.update(100);
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('fuel_exhausted emits when fuel hits 0 and airborne', () => {
            const ac = createAircraft({ fuel: 0.001 });
            sm.addAircraft(ac);
            const handler = vi.fn();
            fs.on('fuel_exhausted', handler);
            fs.update(1000);
            expect(handler).toHaveBeenCalled();
        });

        it('fuel_exhausted does NOT emit for ground aircraft', () => {
            const ac = createAircraft({ fuel: 0.001 });
            ac.state = AircraftState.LANDED;
            sm.addAircraft(ac);
            const handler = vi.fn();
            fs.on('fuel_exhausted', handler);
            fs.update(1000);
            expect(handler).not.toHaveBeenCalled();
        });

        it('fuel_emergency_cleared fires when refueled above threshold', () => {
            const ac = createAircraft({ fuel: 10 });
            sm.addAircraft(ac);
            fs.update(100); // trigger emergency
            expect(ac.fuelEmergency).toBe(true);

            const clearedHandler = vi.fn();
            fs.on('fuel_emergency_cleared', clearedHandler);

            // Simulate refueling
            ac.fuel = 50;
            fs.update(100);
            expect(clearedHandler).toHaveBeenCalledTimes(1);
        });
    });

    // ─── Emergency Handling ──────────────────────────────────────────────

    describe('emergency handling', () => {
        it('assigns nearest free runway to airborne emergency aircraft', () => {
            const ac = createAircraft({ fuel: 14, x: 600, y: 350 });
            sm.addAircraft(ac);
            const assignHandler = vi.fn();
            fs.on('emergency_runway_assigned', assignHandler);
            fs.update(100);
            expect(ac.assignedRunway).toBeTruthy();
            expect(assignHandler).toHaveBeenCalled();
        });

        it('transitions HOLDING_AIR → APPROACHING on emergency', () => {
            const ac = createAircraft({ fuel: 14 });
            sm.addAircraft(ac);
            ac.setState(AircraftState.HOLDING_AIR);
            fs.update(100);
            // Should have been moved to APPROACHING
            expect(ac.state).toBe(AircraftState.APPROACHING);
            expect(ac.assignedRunway).toBeTruthy();
        });

        it('requests runway clearing when all runways occupied', () => {
            // Occupy both runways with landing aircraft
            const landing1 = createAircraft({ fuel: 50 });
            landing1.state = AircraftState.LANDING;
            landing1.assignedRunway = 1;
            sm.addAircraft(landing1);
            sm.runways[0].occupied = true;
            sm.runways[0].occupiedBy = landing1.id;

            const landing2 = createAircraft({ fuel: 50 });
            landing2.state = AircraftState.LANDING;
            landing2.assignedRunway = 2;
            sm.addAircraft(landing2);
            sm.runways[1].occupied = true;
            sm.runways[1].occupiedBy = landing2.id;

            // Emergency aircraft
            const emergency = createAircraft({ fuel: 14 });
            sm.addAircraft(emergency);

            const clearHandler = vi.fn();
            fs.on('runway_cleared', clearHandler);
            fs.update(100);
            // One of the landing aircraft should have gone around
            expect(clearHandler).toHaveBeenCalled();
        });
    });

    // ─── Stats ───────────────────────────────────────────────────────────

    describe('stats', () => {
        it('getEmergencyCount tracks active emergencies', () => {
            const ac = createAircraft({ fuel: 10 });
            sm.addAircraft(ac);
            fs.update(100);
            expect(fs.getEmergencyCount()).toBe(1);
            expect(fs.hasEmergencies()).toBe(true);
        });
    });
});
