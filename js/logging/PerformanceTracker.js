// ============================================================================
// PerformanceTracker.js — Throughput & Efficiency Metrics
// ============================================================================

import { EventEmitter } from '../utils/helpers.js';

export class PerformanceTracker extends EventEmitter {
    constructor() {
        super();
        this.startTime = 0;  // Will be set to simulation time on first snapshot
        this._wallClockStart = Date.now();
        this.landings = 0;
        this.departures = 0;
        this.crashes = 0;
        this.goArounds = 0;
        this.fuelEmergencies = 0;
        this.nearMisses = 0;
        this.totalFuelAtLanding = 0;
        this.landingTimes = [];       // ms from approaching to landed
        this.departureTimes = [];     // ms from at_gate to departing
        this.providerStats = {};
        this._history = [];           // periodic snapshots
        this._lastSnapshotTime = 0;
    }

    recordLanding(aircraft) {
        this.landings++;
        this.totalFuelAtLanding += aircraft.fuel;
        const elapsed = Date.now() - aircraft.createdAt;
        this.landingTimes.push(elapsed);
    }

    recordDeparture(aircraft) {
        this.departures++;
    }

    recordCrash() { this.crashes++; }
    recordGoAround() { this.goArounds++; }
    recordFuelEmergency() { this.fuelEmergencies++; }
    recordNearMiss() { this.nearMisses++; }

    recordProviderDecision(providerName, responseTime) {
        if (!this.providerStats[providerName]) {
            this.providerStats[providerName] = { decisions: 0, totalResponseTime: 0, errors: 0 };
        }
        const ps = this.providerStats[providerName];
        ps.decisions++;
        ps.totalResponseTime += responseTime;
    }

    takeSnapshot(now) {
        if (this.startTime === 0) this.startTime = now;
        if (now - this._lastSnapshotTime < 2000) return;
        this._lastSnapshotTime = now;
        this._history.push({
            time: now - this.startTime,
            landings: this.landings,
            departures: this.departures,
            crashes: this.crashes,
            throughput: this.getThroughput()
        });
        if (this._history.length > 300) this._history.shift();
    }

    getElapsedMinutes() { return (Date.now() - this._wallClockStart) / 60000; }

    getThroughput() {
        const mins = Math.max(1, this.getElapsedMinutes());
        return Math.round(((this.landings + this.departures) / mins) * 10) / 10;
    }

    getSafetyScore() {
        const total = Math.max(1, this.landings + this.departures);
        const incidents = this.crashes * 10 + this.nearMisses * 2 + this.goArounds;
        return Math.max(0, Math.round((1 - incidents / (total + incidents)) * 100));
    }

    getAvgFuelAtLanding() {
        return this.landings > 0 ? Math.round(this.totalFuelAtLanding / this.landings * 10) / 10 : 0;
    }

    getAvgLandingTime() {
        if (this.landingTimes.length === 0) return 0;
        return Math.round(this.landingTimes.reduce((a, b) => a + b, 0) / this.landingTimes.length);
    }

    getMetrics() {
        return {
            elapsed: this.getElapsedMinutes(),
            landings: this.landings,
            departures: this.departures,
            throughput: this.getThroughput(),
            crashes: this.crashes,
            goArounds: this.goArounds,
            fuelEmergencies: this.fuelEmergencies,
            nearMisses: this.nearMisses,
            safetyScore: this.getSafetyScore(),
            avgFuelAtLanding: this.getAvgFuelAtLanding(),
            avgLandingTime: this.getAvgLandingTime(),
            providerStats: { ...this.providerStats }
        };
    }

    getHistory() { return [...this._history]; }

    reset() {
        this.startTime = 0;
        this._wallClockStart = Date.now();
        this.landings = this.departures = this.crashes = this.goArounds = 0;
        this.fuelEmergencies = this.nearMisses = 0;
        this.totalFuelAtLanding = 0;
        this.landingTimes = []; this.departureTimes = [];
        this.providerStats = {}; this._history = [];
    }
}
