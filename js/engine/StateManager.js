// ============================================================================
// StateManager.js — Aircraft Lifecycle & State Transitions
// ============================================================================

import { AircraftState } from '../models/Aircraft.js';
import { distance } from '../utils/helpers.js';
import Config from '../utils/Config.js';
import { EventEmitter } from '../utils/helpers.js';

export class StateManager extends EventEmitter {
    constructor() {
        super();
        this.aircraft = [];
        this.runways = [];
        this.gates = [];
        this.crashHistory = [];        // Track crash history for AI context
        this.activeCollisionWarnings = [];  // Active collision warnings for AI
        this._initAirport();
    }

    _initAirport() {
        const rp = Config.get('airport.runways.positions', [
            { id: 1, x: 600, y: 350, angle: 0, label: "RWY 09L" },
            { id: 2, x: 600, y: 500, angle: 0, label: "RWY 09R" }
        ]);
        this.runways = rp.map(r => ({
            ...r, length: Config.get('airport.runways.length', 300),
            occupied: false, occupiedBy: null, clearing: false
        }));
        const gp = Config.get('airport.gates.positions', []);
        this.gates = gp.map(g => ({ ...g, occupied: false, occupiedBy: null }));
    }

    addAircraft(ac) { this.aircraft.push(ac); this.emit('aircraft_added', ac); }

    removeAircraft(ac) {
        ac.destroy();
        if (ac.assignedRunway) this.releaseRunway(ac.assignedRunway, ac.id);
        if (ac.assignedGate) this.releaseGate(ac.assignedGate, ac.id);
        this.aircraft = this.aircraft.filter(a => a.id !== ac.id);
        this.emit('aircraft_removed', ac);
    }

    update(deltaTime) {
        const toRemove = [];
        for (const ac of this.aircraft) {
            this._processTransitions(ac);
            if (ac.state === AircraftState.DEPARTING && ac.x > 1300) {
                toRemove.push(ac); this.emit('aircraft_departed', ac);
            }
            if (ac.state === AircraftState.APPROACHING && ac.x < -100) toRemove.push(ac);
        }
        for (const ac of toRemove) this.removeAircraft(ac);
    }

    _processTransitions(ac) {
        switch (ac.state) {
            case AircraftState.APPROACHING:
                if (ac.assignedRunway && ac.hasReachedTarget()) {
                    const rw = this.getRunway(ac.assignedRunway);
                    // Touch down at runway threshold (right end) and roll toward the left end
                    if (rw) { ac.setTarget(rw.x, rw.y); ac.setState(AircraftState.LANDING); rw.occupied = true; rw.occupiedBy = ac.id; this.emit('aircraft_landing', ac); }
                }
                break;
            case AircraftState.LANDING:
                if (ac.hasReachedTarget()) { ac.setState(AircraftState.LANDED); this.emit('aircraft_landed', ac); }
                break;
            case AircraftState.LANDED:
                if (ac.assignedGate) {
                    const gt = this.getGate(ac.assignedGate);
                    if (gt && gt.occupiedBy === ac.id) {
                        if (ac.assignedRunway) this.releaseRunway(ac.assignedRunway, ac.id);
                        ac.setTarget(gt.x, gt.y); ac.setState(AircraftState.TAXIING_TO_GATE); this.emit('aircraft_taxiing_to_gate', ac);
                    }
                }
                break;
            case AircraftState.TAXIING_TO_GATE:
                if (ac.hasReachedTarget()) { ac.setState(AircraftState.BOARDING); this.emit('aircraft_boarding', ac); }
                break;
            case AircraftState.BOARDING:
                if (ac.boardingProgress >= 1) { ac.setState(AircraftState.AT_GATE); this.emit('aircraft_at_gate', ac); }
                break;
            case AircraftState.TAXIING_TO_RUNWAY:
                if (ac.hasReachedTarget()) {
                    const rw = this.getRunway(ac.assignedRunway);
                    if (rw && !rw.occupied) { rw.occupied = true; rw.occupiedBy = ac.id; ac.setState(AircraftState.TAKEOFF); ac.setTarget(rw.x + rw.length, rw.y); this.emit('aircraft_takeoff', ac); }
                    else ac.setState(AircraftState.HOLDING_GROUND);
                }
                break;
            case AircraftState.TAKEOFF:
                if (ac.hasReachedTarget()) {
                    if (ac.assignedRunway) this.releaseRunway(ac.assignedRunway, ac.id);
                    if (ac.assignedGate) this.releaseGate(ac.assignedGate, ac.id);
                    ac.setState(AircraftState.DEPARTING); ac.setTarget(1300, ac.y + (Math.random() - 0.5) * 100); this.emit('aircraft_departing', ac);
                }
                break;
        }
    }

    assignRunway(acId, rwId) {
        const ac = this.getAircraft(acId), rw = this.getRunway(rwId);
        if (!ac || !rw) return false;
        ac.assignedRunway = rwId;
        if (ac.state === AircraftState.APPROACHING) ac.setTarget(rw.x + rw.length, rw.y);
        return true;
    }

    assignGate(acId, gId) {
        const ac = this.getAircraft(acId), gt = this.getGate(gId);
        if (!ac || !gt || gt.occupied) return false;
        ac.assignedGate = gId;
        gt.occupied = true;
        gt.occupiedBy = ac.id;
        return true;
    }

    startDeparture(acId, rwId) {
        const ac = this.getAircraft(acId), rw = this.getRunway(rwId);
        if (!ac || !rw || ac.state !== AircraftState.AT_GATE) return false;
        if (ac.assignedGate) { this.releaseGate(ac.assignedGate, ac.id); ac.assignedGate = null; }
        ac.assignedRunway = rwId; ac.setTarget(rw.x, rw.y); ac.setState(AircraftState.TAXIING_TO_RUNWAY); this.emit('aircraft_taxiing_to_runway', ac);
        return true;
    }

    holdAircraft(acId) {
        const ac = this.getAircraft(acId);
        if (!ac) return false;
        if (ac.state === AircraftState.APPROACHING) { ac.setState(AircraftState.HOLDING_AIR); return true; }
        if (ac.state === AircraftState.TAXIING_TO_RUNWAY) { ac.setState(AircraftState.HOLDING_GROUND); return true; }
        return false;
    }

    clearHold(acId) {
        const ac = this.getAircraft(acId);
        if (!ac) return false;
        if (ac.state === AircraftState.HOLDING_AIR && ac.assignedRunway) {
            const rw = this.getRunway(ac.assignedRunway);
            if (rw) { ac.setTarget(rw.x + rw.length, rw.y); ac.setState(AircraftState.APPROACHING); return true; }
        }
        if (ac.state === AircraftState.HOLDING_GROUND && ac.assignedRunway) {
            const rw = this.getRunway(ac.assignedRunway);
            if (rw && !rw.occupied) { rw.occupied = true; rw.occupiedBy = ac.id; ac.setState(AircraftState.TAKEOFF); ac.setTarget(rw.x + rw.length, rw.y); return true; }
        }
        return false;
    }

    getAircraft(id) { return this.aircraft.find(a => a.id === id); }
    getAircraftByCallsign(cs) { return this.aircraft.find(a => a.callsign === cs); }
    getRunway(id) { return this.runways.find(r => r.id === id); }
    getGate(id) { return this.gates.find(g => g.id === id); }
    getFreeRunways() { return this.runways.filter(r => !r.occupied); }
    getFreeGates() { return this.gates.filter(g => !g.occupied); }

    releaseRunway(rwId, ownerId) {
        const rw = this.getRunway(rwId);
        if (rw && rw.occupiedBy === ownerId) { rw.occupied = false; rw.occupiedBy = null; }
    }

    releaseGate(gId, ownerId) {
        const gt = this.getGate(gId);
        if (gt && gt.occupiedBy === ownerId) { gt.occupied = false; gt.occupiedBy = null; }
    }

    getActiveAircraft() { return this.aircraft.filter(a => a.state !== AircraftState.REMOVED); }
    getAirborneAircraft() { return this.aircraft.filter(a => a.isAirborne()); }
    getGroundAircraft() { return this.aircraft.filter(a => a.isOnGround()); }

    // Track crash for AI learning context
    recordCrash(crashInfo) {
        this.crashHistory.push({
            ...crashInfo,
            time: Date.now()
        });
        // Keep last 20 crashes
        if (this.crashHistory.length > 20) this.crashHistory.shift();
    }

    // Update collision warnings for AI context
    setCollisionWarnings(warnings) {
        this.activeCollisionWarnings = warnings;
    }

    getSnapshot() {
        return {
            aircraft: this.aircraft.map(a => a.getStatusSnapshot()),
            runways: this.runways.map(r => ({ id: r.id, label: r.label, occupied: r.occupied, occupiedBy: r.occupiedBy ? this.getAircraft(r.occupiedBy)?.callsign : null })),
            gates: this.gates.map(g => ({ id: g.id, occupied: g.occupied, occupiedBy: g.occupiedBy ? this.getAircraft(g.occupiedBy)?.callsign : null })),
            counts: { total: this.aircraft.length, airborne: this.getAirborneAircraft().length, ground: this.getGroundAircraft().length, freeRunways: this.getFreeRunways().length, freeGates: this.getFreeGates().length },
            // Safety context for AI
            safetyContext: {
                totalCrashes: this.crashHistory.length,
                recentCrashes: this.crashHistory.slice(-3).map(c => ({
                    callsignA: c.aircraftA?.callsign || 'Unknown',
                    callsignB: c.aircraftB?.callsign || 'Unknown',
                    type: c.type || 'collision',
                    reason: c.reason || 'unknown'
                })),
                fuelEmergencyCount: this.aircraft.filter(a => a.fuelEmergency).length,
                lowFuelCount: this.aircraft.filter(a => a.fuelLow).length
            },
            // Active collision warnings
            collisionWarnings: this.activeCollisionWarnings.map(([key, w]) => ({
                aircraftA: this.getAircraft(w.aircraftA)?.callsign || w.aircraftA,
                aircraftB: this.getAircraft(w.aircraftB)?.callsign || w.aircraftB,
                level: w.level
            }))
        };
    }
}
