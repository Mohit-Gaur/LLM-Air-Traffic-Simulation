// ============================================================================
// Aircraft.js — Aircraft Entity Model
// ============================================================================

import { uuid, generateCallsign, releaseCallsign, distance, angle, lerp, lerpAngle, clamp, randomRange, pickWeighted } from '../utils/helpers.js';
import Config from '../utils/Config.js';

// Aircraft states in lifecycle order
export const AircraftState = {
    APPROACHING: 'approaching',
    HOLDING_AIR: 'holding_air',
    LANDING: 'landing',
    GO_AROUND: 'go_around',
    LANDED: 'landed',
    TAXIING_TO_GATE: 'taxiing_to_gate',
    BOARDING: 'boarding',
    AT_GATE: 'at_gate',
    TAXIING_TO_RUNWAY: 'taxiing_to_runway',
    HOLDING_GROUND: 'holding_ground',
    TAKEOFF: 'takeoff',
    DEPARTING: 'departing',
    REMOVED: 'removed'
};

// Valid state transitions
// Passenger capacity by aircraft type
const PASSENGER_CAPACITY = {
    'A320': [140, 180],
    'B737': [120, 180],
    'B777': [300, 400],
    'A380': [500, 850],
    'ATR72': [50, 72]
};

// Flight origin/destination pools for realism
const ORIGINS = ['JFK', 'LAX', 'ORD', 'DFW', 'DEN', 'SFO', 'SEA', 'MIA', 'BOS', 'ATL', 'CDG', 'LHR', 'NRT', 'DXB', 'SIN'];
const DESTINATIONS = ['ATL', 'BOS', 'LAS', 'PHX', 'IAH', 'CLT', 'MSP', 'DTW', 'FRA', 'AMS', 'HND', 'ICN', 'SYD', 'YYZ'];

const VALID_TRANSITIONS = {
    [AircraftState.APPROACHING]: [AircraftState.HOLDING_AIR, AircraftState.LANDING],
    [AircraftState.HOLDING_AIR]: [AircraftState.LANDING, AircraftState.APPROACHING],
    [AircraftState.LANDING]: [AircraftState.LANDED, AircraftState.GO_AROUND],
    [AircraftState.GO_AROUND]: [AircraftState.HOLDING_AIR],
    [AircraftState.LANDED]: [AircraftState.TAXIING_TO_GATE],
    [AircraftState.TAXIING_TO_GATE]: [AircraftState.BOARDING],
    [AircraftState.BOARDING]: [AircraftState.AT_GATE],
    [AircraftState.AT_GATE]: [AircraftState.TAXIING_TO_RUNWAY],
    [AircraftState.TAXIING_TO_RUNWAY]: [AircraftState.HOLDING_GROUND, AircraftState.TAKEOFF],
    [AircraftState.HOLDING_GROUND]: [AircraftState.TAKEOFF],
    [AircraftState.TAKEOFF]: [AircraftState.DEPARTING],
    [AircraftState.DEPARTING]: [AircraftState.REMOVED],
    [AircraftState.REMOVED]: []
};

export class Aircraft {
    constructor(type = null) {
        const types = Config.get('aircraft.types', [
            { name: "A320", weight: 40, size: 18, maxSpeed: 4, color: "#00e5ff" }
        ]);
        const selectedType = type || pickWeighted(types);

        this.id = uuid();
        this.callsign = generateCallsign();
        this.type = selectedType.name;
        this.size = selectedType.size;
        this.maxSpeed = selectedType.maxSpeed;
        this.color = selectedType.color;
        this.engines = selectedType.engines || 'twin-jet';

        // Passenger info
        const [minPax, maxPax] = PASSENGER_CAPACITY[this.type] || [100, 200];
        this.passengerCount = Math.floor(randomRange(minPax, maxPax));

        // Flight origin / destination (cosmetic realism)
        this.origin = ORIGINS[Math.floor(Math.random() * ORIGINS.length)];
        this.destination = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];

        // Position & movement
        this.x = 0;
        this.y = 0;
        this.heading = Math.PI;  // facing left (towards airport)
        this.speed = selectedType.maxSpeed * 0.8;
        this.targetX = null;
        this.targetY = null;
        this.altitude = 3000; // virtual altitude for display

        // Fuel
        const fuelConfig = Config.get('aircraft.fuel', {});
        this.fuel = randomRange(
            fuelConfig.initial_min || 40,
            fuelConfig.initial_max || 100
        );
        this.maxFuel = 100;
        this.refuelTarget = randomRange(
            fuelConfig.refuel_target_min || 50,
            fuelConfig.refuel_target_max || 100
        );
        this.isRefueling = false;

        // State
        this.state = AircraftState.APPROACHING;
        this.previousState = null;
        this.assignedRunway = null;
        this.assignedGate = null;

        // Flags
        this.isEmergency = false;
        this.fuelEmergency = false;
        this.fuelLow = false;
        this.collisionAvoidanceActive = false;
        this.goAroundCount = 0;

        // Timers
        this.stateTimer = 0;
        this.gateTimer = 0;
        // Boarding time based on passengers: 3s base + 0.08s per pax (in ms)
        this.boardingDuration = 3000 + this.passengerCount * 80;
        // Gate operation = boarding + 5s turnaround buffer
        this.gateOperationDuration = this.boardingDuration + 5000;
        this.boardingProgress = 0; // 0-1 fraction
        this.holdingAngle = Math.random() * Math.PI * 2;
        this.holdingRadius = randomRange(60, 100);
        this.holdingCenter = null;

        // Avoidance
        this.avoidanceVector = { x: 0, y: 0 };

        // Crash info
        this.crashReason = null;  // 'FUEL_DEPLETION' | 'COLLISION' | null

        // Tracking
        this.createdAt = Date.now();
        this.stateHistory = [{ state: this.state, time: this.createdAt }];
        this.trail = []; // position history for trail rendering
        this.trailMaxLength = 30;

        // Blinking / visual effects
        this.blinkTimer = 0;
        this.blinkOn = true;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update(deltaTime) {
        if (this.state === AircraftState.REMOVED) return;

        const dt = deltaTime / 1000; // convert to seconds

        // Update trail
        if (this.trail.length === 0 || 
            distance(this, this.trail[this.trail.length - 1]) > 8) {
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > this.trailMaxLength) {
                this.trail.shift();
            }
        }

        // Update blink
        this.blinkTimer += deltaTime;
        if (this.blinkTimer > 500) {
            this.blinkTimer = 0;
            this.blinkOn = !this.blinkOn;
        }
        this.pulsePhase += deltaTime * 0.003;

        // State timer
        this.stateTimer += deltaTime;

        // Update based on state
        this._updateMovement(dt, deltaTime);
    }

    _updateMovement(dt, deltaTime) {
        switch (this.state) {
            case AircraftState.APPROACHING:
                this._moveToTarget(dt, this.maxSpeed * 0.8);
                break;

            case AircraftState.HOLDING_AIR:
                this._doHoldingPattern(dt);
                break;

            case AircraftState.LANDING: {
                // Decelerate along the runway: start at approach speed then brake
                const landDist = this.targetX !== null ? distance(this, { x: this.targetX, y: this.targetY }) : 0;
                const landSpeed = Math.max(0.8, this.maxSpeed * 0.6 * Math.min(1, landDist / 150));
                this._moveToTarget(dt, landSpeed);
                // Altitude drops to 0 quickly at touchdown then stays at 0
                this.altitude = this.altitude > 10 ? lerp(this.altitude, 0, dt * 2.0) : 0;
                break;
            }

            case AircraftState.GO_AROUND:
                // Climb out at full power and transition to holding
                this._moveToTarget(dt, this.maxSpeed * 0.9);
                this.altitude = lerp(this.altitude, 2500, dt * 0.4);
                // After reaching holding altitude / climbing for 3s, transition to hold
                if (this.stateTimer > 3000) {
                    this.setState(AircraftState.HOLDING_AIR);
                }
                break;

            case AircraftState.LANDED:
                this.speed = lerp(this.speed, 0, dt * 2);
                break;

            case AircraftState.TAXIING_TO_GATE:
                this._moveToTarget(dt, Config.get('airport.taxiway_speed', 1.5));
                break;

            case AircraftState.BOARDING:
                this.speed = 0;
                this.gateTimer += deltaTime;
                this.boardingProgress = clamp(this.gateTimer / this.boardingDuration, 0, 1);
                // Refueling happens in parallel during boarding
                if (this.isRefueling && this.fuel < this.refuelTarget) {
                    const refuelRate = Config.get('aircraft.fuel.refuel_rate', 0.5);
                    this.fuel = Math.min(this.refuelTarget, this.fuel + refuelRate * dt);
                    if (this.fuel >= this.refuelTarget) {
                        this.isRefueling = false;
                    }
                }
                break;

            case AircraftState.AT_GATE:
                this.speed = 0;
                this.gateTimer += deltaTime;
                // Continue refueling at gate if not done during boarding
                if (this.isRefueling && this.fuel < this.refuelTarget) {
                    const refuelRate = Config.get('aircraft.fuel.refuel_rate', 0.5);
                    this.fuel = Math.min(this.refuelTarget, this.fuel + refuelRate * dt);
                    if (this.fuel >= this.refuelTarget) {
                        this.isRefueling = false;
                    }
                }
                break;

            case AircraftState.TAXIING_TO_RUNWAY:
                this._moveToTarget(dt, Config.get('airport.taxiway_speed', 1.5));
                break;

            case AircraftState.HOLDING_GROUND:
                this.speed = 0;
                break;

            case AircraftState.TAKEOFF:
                this._moveToTarget(dt, this.maxSpeed * 1.2);
                this.altitude = lerp(this.altitude, 3000, dt * 0.3);
                break;

            case AircraftState.DEPARTING:
                this._moveToTarget(dt, this.maxSpeed);
                this.altitude = lerp(this.altitude, 5000, dt * 0.2);
                break;
        }

        // Apply avoidance vector
        if (this.collisionAvoidanceActive) {
            this.x += this.avoidanceVector.x * dt;
            this.y += this.avoidanceVector.y * dt;
            // Decay avoidance
            this.avoidanceVector.x *= 0.95;
            this.avoidanceVector.y *= 0.95;
            if (Math.abs(this.avoidanceVector.x) < 0.01 && Math.abs(this.avoidanceVector.y) < 0.01) {
                this.collisionAvoidanceActive = false;
            }
        }
    }

    _moveToTarget(dt, maxSpeed) {
        if (this.targetX === null || this.targetY === null) return;

        const target = { x: this.targetX, y: this.targetY };
        const dist = distance(this, target);

        if (dist < 5) {
            this.x = this.targetX;
            this.y = this.targetY;
            this.speed = 0;
            return;
        }

        const targetAngle = angle(this, target);
        this.heading = lerpAngle(this.heading, targetAngle, dt * 3);

        // Slow down as we approach
        const approachSpeed = Math.min(maxSpeed, dist * 0.05 + 0.5);
        this.speed = lerp(this.speed, approachSpeed, dt * 2);

        this.x += Math.cos(this.heading) * this.speed * dt * 60;
        this.y += Math.sin(this.heading) * this.speed * dt * 60;
    }

    _doHoldingPattern(dt) {
        if (!this.holdingCenter) {
            this.holdingCenter = { x: this.x, y: this.y };
        }
        this.holdingAngle += dt * 0.8;
        const targetX = this.holdingCenter.x + Math.cos(this.holdingAngle) * this.holdingRadius;
        const targetY = this.holdingCenter.y + Math.sin(this.holdingAngle) * this.holdingRadius;

        const targetAngle = angle(this, { x: targetX, y: targetY });
        this.heading = lerpAngle(this.heading, targetAngle, dt * 2);

        this.speed = lerp(this.speed, this.maxSpeed * 0.5, dt);
        this.x += Math.cos(this.heading) * this.speed * dt * 60;
        this.y += Math.sin(this.heading) * this.speed * dt * 60;
    }

    setTarget(x, y) {
        this.targetX = x;
        this.targetY = y;
    }

    applyAvoidance(vector) {
        this.avoidanceVector.x += vector.x;
        this.avoidanceVector.y += vector.y;
        this.collisionAvoidanceActive = true;
    }

    setState(newState) {
        if (!VALID_TRANSITIONS[this.state]?.includes(newState)) {
            console.warn(`[Aircraft] Invalid transition: ${this.state} → ${newState} for ${this.callsign}`);
            return false;
        }

        this.previousState = this.state;
        this.state = newState;
        this.stateTimer = 0;
        this.stateHistory.push({ state: newState, time: Date.now() });

        // State entry actions
        switch (newState) {
            case AircraftState.BOARDING:
                this.speed = 0;
                this.gateTimer = 0;
                this.boardingProgress = 0;
                this.isRefueling = true;
                break;
            case AircraftState.AT_GATE:
                this.speed = 0;
                // Don't reset gateTimer — it carries over from boarding
                break;
            case AircraftState.HOLDING_AIR:
                this.holdingCenter = { x: this.x, y: this.y };
                break;
            case AircraftState.GO_AROUND:
                this.goAroundCount++;
                this.altitude = Math.max(this.altitude, 500);
                // Set a climb-out target ahead and above
                const climbX = this.x - 150 + Math.random() * 100;
                const climbY = this.y + (Math.random() - 0.5) * 200;
                this.setTarget(climbX, climbY);
                break;
            case AircraftState.LANDED:
                this.altitude = 0;
                break;
            case AircraftState.TAKEOFF:
                this.heading = 0; // face right for takeoff
                break;
        }

        return true;
    }

    startGoAround() {
        if (this.state !== AircraftState.LANDING) return false;
        this.setState(AircraftState.GO_AROUND);
        this.assignedRunway = null;
        return true;
    }

    hasReachedTarget() {
        if (this.targetX === null || this.targetY === null) return false;
        return distance(this, { x: this.targetX, y: this.targetY }) < 10;
    }

    isAirborne() {
        return [
            AircraftState.APPROACHING,
            AircraftState.HOLDING_AIR,
            AircraftState.LANDING,
            AircraftState.GO_AROUND,
            AircraftState.DEPARTING,
            AircraftState.TAKEOFF
        ].includes(this.state);
    }

    isOnGround() {
        return [
            AircraftState.LANDED,
            AircraftState.TAXIING_TO_GATE,
            AircraftState.BOARDING,
            AircraftState.AT_GATE,
            AircraftState.TAXIING_TO_RUNWAY,
            AircraftState.HOLDING_GROUND
        ].includes(this.state);
    }

    needsRunwayAssignment() {
        return this.state === AircraftState.APPROACHING && !this.assignedRunway;
    }

    needsGateAssignment() {
        return this.state === AircraftState.LANDED && !this.assignedGate;
    }

    isReadyForDeparture() {
        return this.state === AircraftState.AT_GATE &&
            this.stateTimer >= 5000 &&  // 5s turnaround at gate after boarding
            !this.isRefueling;
    }

    getBoardingProgress() {
        if (this.state !== AircraftState.BOARDING) return this.state === AircraftState.AT_GATE ? 1 : 0;
        return this.boardingProgress;
    }

    getStatusSnapshot() {
        return {
            id: this.id,
            callsign: this.callsign,
            type: this.type,
            state: this.state,
            position: { x: Math.round(this.x), y: Math.round(this.y) },
            heading: Math.round(this.heading * 180 / Math.PI),
            speed: Math.round(this.speed * 100) / 100,
            altitude: Math.round(this.altitude),
            fuel: Math.round(this.fuel * 10) / 10,
            fuelEmergency: this.fuelEmergency,
            fuelLow: this.fuelLow,
            isEmergency: this.isEmergency,
            assignedRunway: this.assignedRunway,
            assignedGate: this.assignedGate,
            goAroundCount: this.goAroundCount,
            collisionAvoidanceActive: this.collisionAvoidanceActive,
            timeInState: this.stateTimer,
            needsRunway: this.needsRunwayAssignment(),
            needsGate: this.needsGateAssignment(),
            readyForDeparture: this.isReadyForDeparture(),
            passengers: this.passengerCount,
            origin: this.origin,
            destination: this.destination,
            boardingProgress: this.getBoardingProgress(),
            crashReason: this.crashReason
        };
    }

    destroy() {
        releaseCallsign(this.callsign);
        this.state = AircraftState.REMOVED;
    }
}
