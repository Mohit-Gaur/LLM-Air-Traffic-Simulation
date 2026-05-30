// ============================================================================
// RuleBasedAI.js — Deterministic Rule-Based Controller
// ============================================================================

import { LLMAdapter } from './LLMAdapter.js';
import { AircraftState } from '../models/Aircraft.js';

export class RuleBasedAI extends LLMAdapter {
    constructor() {
        super('Rule Based', 'rule-based-v1');
    }

    async getDecisions(state) {
        const start = performance.now();
        const decisions = [];

        const aircraft = state.aircraft;
        const runways = state.runways;
        const gates = state.gates;

        // Sort by priority: fuel emergency first, then low fuel, then by time
        const sorted = [...aircraft].sort((a, b) => {
            if (a.fuelEmergency && !b.fuelEmergency) return -1;
            if (!a.fuelEmergency && b.fuelEmergency) return 1;
            if (a.fuelLow && !b.fuelLow) return -1;
            if (!a.fuelLow && b.fuelLow) return 1;
            return a.timeInState - b.timeInState;
        });

        for (const ac of sorted) {
            // 1. Assign runways to approaching aircraft
            if (ac.needsRunway) {
                const freeRw = runways.find(r => !r.occupied);
                if (freeRw) {
                    decisions.push({
                        aircraftId: ac.id, action: 'ASSIGN_RUNWAY',
                        parameters: { runwayId: freeRw.id },
                        reasoning: ac.fuelEmergency
                            ? `EMERGENCY: ${ac.callsign} has ${ac.fuel}% fuel, immediate runway assignment`
                            : `Assigning free runway ${freeRw.label || freeRw.id} to ${ac.callsign}`
                    });
                    freeRw.occupied = true; // Mark as taken for this round
                } else if (!ac.fuelEmergency) {
                    decisions.push({
                        aircraftId: ac.id, action: 'HOLD',
                        parameters: { reason: 'No free runways available' },
                        reasoning: `All runways occupied, ${ac.callsign} entering hold`
                    });
                }
            }

            // 2. Assign gates to landed aircraft
            if (ac.needsGate) {
                const freeGt = gates.find(g => !g.occupied);
                if (freeGt) {
                    decisions.push({
                        aircraftId: ac.id, action: 'ASSIGN_GATE',
                        parameters: { gateId: freeGt.id },
                        reasoning: `Assigning gate ${freeGt.id} to ${ac.callsign}`
                    });
                    freeGt.occupied = true;
                }
            }

            // 3. Start departures for ready aircraft
            if (ac.readyForDeparture) {
                const freeRw = runways.find(r => !r.occupied);
                if (freeRw) {
                    decisions.push({
                        aircraftId: ac.id, action: 'START_DEPARTURE',
                        parameters: { runwayId: freeRw.id },
                        reasoning: `${ac.callsign} boarding complete, starting departure via runway ${freeRw.label || freeRw.id}`
                    });
                    freeRw.occupied = true;
                }
            }

            // 4. Clear holds when runway available
            if (ac.state === 'holding_air' && ac.assignedRunway) {
                const rw = runways.find(r => r.id === ac.assignedRunway);
                if (rw && !rw.occupied) {
                    decisions.push({
                        aircraftId: ac.id, action: 'CLEAR_LANDING',
                        parameters: { runwayId: rw.id },
                        reasoning: `Runway ${rw.label || rw.id} now free, clearing ${ac.callsign} for approach`
                    });
                }
            }

            if (ac.state === 'holding_ground' && ac.assignedRunway) {
                const rw = runways.find(r => r.id === ac.assignedRunway);
                if (rw && !rw.occupied) {
                    decisions.push({
                        aircraftId: ac.id, action: 'CLEAR_TAKEOFF',
                        parameters: { runwayId: rw.id },
                        reasoning: `Runway ${rw.label || rw.id} clear, ${ac.callsign} cleared for takeoff`
                    });
                }
            }
        }

        this._trackResponseTime(performance.now() - start);
        return decisions;
    }
}
