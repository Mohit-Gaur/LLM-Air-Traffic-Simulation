// ============================================================================
// FuelSystem.js — Fuel Management & Emergency Detection
// ============================================================================

import { AircraftState } from '../models/Aircraft.js';
import Config from '../utils/Config.js';
import { EventEmitter, throttle } from '../utils/helpers.js';

export class FuelSystem extends EventEmitter {
    constructor(stateManager) {
        super();
        this.stateManager = stateManager;
        this.emergencyAircraft = new Set();
        this.lowFuelAircraft = new Set();
        this._lastWarnings = {};
        this._warningCooldown = 5000; // ms between repeated warnings for same aircraft
    }

    update(deltaTime) {
        const dt = deltaTime / 1000;
        const consumption = Config.get('aircraft.fuel.consumption', {});
        const emergencyThreshold = Config.get('aircraft.fuel.emergency_threshold', 15);
        const lowThreshold = Config.get('aircraft.fuel.low_threshold', 25);

        for (const ac of this.stateManager.aircraft) {
            if (ac.state === AircraftState.REMOVED) continue;

            // Consume fuel based on state
            const rate = consumption[ac.state] || 0.05;
            ac.fuel = Math.max(0, ac.fuel - rate * dt);

            // Check fuel levels
            const wasEmergency = ac.fuelEmergency;
            const wasLow = ac.fuelLow;

            ac.fuelEmergency = ac.fuel <= emergencyThreshold;
            ac.fuelLow = ac.fuel <= lowThreshold && !ac.fuelEmergency;
            ac.isEmergency = ac.fuelEmergency;

            // Emit events on state changes
            if (ac.fuelEmergency && !wasEmergency) {
                this.emergencyAircraft.add(ac.id);
                this.emit('fuel_emergency', ac);
                this._handleFuelEmergency(ac);
            } else if (ac.fuelLow && !wasLow) {
                this.lowFuelAircraft.add(ac.id);
                this._throttledLowFuelWarning(ac);
            }

            // Clear flags when refueled
            if (!ac.fuelEmergency && wasEmergency) {
                this.emergencyAircraft.delete(ac.id);
                this.emit('fuel_emergency_cleared', ac);
            }
            if (!ac.fuelLow && wasLow) {
                this.lowFuelAircraft.delete(ac.id);
            }

            // Out of fuel
            if (ac.fuel <= 0 && ac.isAirborne()) {
                this.emit('fuel_exhausted', ac);
            }
        }
    }

    _handleFuelEmergency(ac) {
        // Priority: if aircraft is airborne, try to get it landed ASAP
        if (ac.isAirborne()) {
            // Find nearest free runway
            const freeRunways = this.stateManager.getFreeRunways();
            if (freeRunways.length > 0 && !ac.assignedRunway) {
                // Assign nearest runway
                let nearest = freeRunways[0];
                let minDist = Infinity;
                for (const rw of freeRunways) {
                    const d = Math.hypot(ac.x - rw.x, ac.y - rw.y);
                    if (d < minDist) { minDist = d; nearest = rw; }
                }
                this.stateManager.assignRunway(ac.id, nearest.id);
                this.emit('emergency_runway_assigned', { aircraft: ac, runway: nearest });
            }

            // If in holding, clear it
            if (ac.state === AircraftState.HOLDING_AIR) {
                this.stateManager.clearHold(ac.id);
            }

            // Request runway clearing if all occupied
            if (freeRunways.length === 0) {
                this.emit('runway_clearing_requested', ac);
                this._requestRunwayClearing(ac);
            }
        }
    }

    _requestRunwayClearing(emergencyAc) {
        // Find aircraft on runways that can be told to go around
        for (const rw of this.stateManager.runways) {
            if (rw.occupied && rw.occupiedBy) {
                const occupant = this.stateManager.getAircraft(rw.occupiedBy);
                if (occupant && occupant.state === AircraftState.LANDING) {
                    occupant.startGoAround();
                    rw.occupied = false;
                    rw.occupiedBy = null;
                    this.stateManager.assignRunway(emergencyAc.id, rw.id);
                    this.emit('runway_cleared', { runway: rw, cleared: occupant, forAircraft: emergencyAc });
                    return;
                }
            }
        }
    }

    _throttledLowFuelWarning(ac) {
        const now = Date.now();
        const lastWarning = this._lastWarnings[ac.id] || 0;
        if (now - lastWarning >= this._warningCooldown) {
            this._lastWarnings[ac.id] = now;
            this.emit('fuel_low', ac);
        }
    }

    getEmergencyCount() { return this.emergencyAircraft.size; }
    hasEmergencies() { return this.emergencyAircraft.size > 0; }
}
