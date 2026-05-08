// ============================================================================
// FlightScheduler.js — Aircraft Spawning & Traffic Management
// ============================================================================

import { Aircraft, AircraftState } from '../models/Aircraft.js';
import Config from '../utils/Config.js';
import { randomRange } from '../utils/helpers.js';
import { EventEmitter } from '../utils/helpers.js';

export class FlightScheduler extends EventEmitter {
    constructor(stateManager) {
        super();
        this.stateManager = stateManager;
        this.lastSpawnTime = 0;
        this.nextSpawnDelay = 5000;
        this.spawnEnabled = true;
        this.totalSpawned = 0;
        this._sectorIndex = 0;
    }

    update(deltaTime, now) {
        if (!this.spawnEnabled) return;

        const maxActive = Config.get('aircraft.max_active', 15);
        const activeCount = this.stateManager.getActiveAircraft().length;

        if (activeCount >= maxActive) return;

        if (now - this.lastSpawnTime >= this.nextSpawnDelay) {
            this._spawnAircraft();
            this.lastSpawnTime = now;
            this._calculateNextSpawnDelay(activeCount, maxActive);
        }
    }

    _spawnAircraft() {
        const ac = new Aircraft();
        const zone = Config.get('simulation.approach_zone', {
            min_x: 900, max_x: 1150, min_y: 100, max_y: 700
        });

        // Sector-based spawning to prevent clustering
        const sectors = 4;
        const sectorHeight = (zone.max_y - zone.min_y) / sectors;
        const sectorY = zone.min_y + (this._sectorIndex % sectors) * sectorHeight;
        this._sectorIndex++;

        ac.x = randomRange(zone.min_x, zone.max_x);
        ac.y = randomRange(sectorY, sectorY + sectorHeight);
        ac.heading = Math.PI + randomRange(-0.3, 0.3); // facing roughly left
        ac.altitude = randomRange(2000, 4000);

        this.stateManager.addAircraft(ac);
        this.totalSpawned++;
        this.emit('aircraft_spawned', ac);
    }

    _calculateNextSpawnDelay(activeCount, maxActive) {
        const spawnRate = Config.get('aircraft.spawn_rate', { min: 4000, max: 9000 });
        // More aircraft = longer delay (congestion-aware)
        const congestionFactor = activeCount / maxActive;
        const baseDelay = randomRange(spawnRate.min, spawnRate.max);
        this.nextSpawnDelay = baseDelay * (1 + congestionFactor);
    }

    setSpawnEnabled(enabled) { this.spawnEnabled = enabled; }
    getStats() {
        return { totalSpawned: this.totalSpawned, spawnEnabled: this.spawnEnabled, nextSpawnIn: Math.max(0, this.nextSpawnDelay - (Date.now() - this.lastSpawnTime)) };
    }
}
