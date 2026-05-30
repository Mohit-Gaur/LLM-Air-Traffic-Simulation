// ============================================================================
// FlightScheduler.test.js — Tests for aircraft spawning
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlightScheduler } from '../../js/engine/FlightScheduler.js';
import { StateManager } from '../../js/engine/StateManager.js';
import { createAircraft } from '../helpers/testFactories.js';

describe('FlightScheduler', () => {
    let sm, scheduler;

    beforeEach(() => {
        sm = new StateManager();
        scheduler = new FlightScheduler(sm);
    });

    it('spawns aircraft after initial delay', () => {
        const handler = vi.fn();
        scheduler.on('aircraft_spawned', handler);
        // First call at time 0 won't spawn (lastSpawnTime=0, nextSpawnDelay=5000)
        scheduler.update(100, 100);
        expect(handler).not.toHaveBeenCalled();

        // Advance past initial delay
        scheduler.update(100, 6000);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(sm.aircraft).toHaveLength(1);
    });

    it('respects max_active limit', () => {
        // Fill to max
        for (let i = 0; i < 12; i++) {
            sm.addAircraft(createAircraft());
        }
        const initialCount = sm.aircraft.length;
        scheduler.update(100, 10000);
        expect(sm.aircraft.length).toBe(initialCount);
    });

    it('does not spawn when disabled', () => {
        scheduler.setSpawnEnabled(false);
        scheduler.update(100, 10000);
        expect(sm.aircraft).toHaveLength(0);
    });

    it('re-enables spawning', () => {
        scheduler.setSpawnEnabled(false);
        scheduler.setSpawnEnabled(true);
        scheduler.update(100, 10000);
        expect(sm.aircraft).toHaveLength(1);
    });

    it('positions aircraft in approach zone', () => {
        scheduler.update(100, 10000);
        const ac = sm.aircraft[0];
        expect(ac.x).toBeGreaterThanOrEqual(900);
        expect(ac.x).toBeLessThanOrEqual(1150);
        expect(ac.y).toBeGreaterThanOrEqual(100);
        expect(ac.y).toBeLessThanOrEqual(700);
    });

    it('cycles through sectors', () => {
        const yPositions = [];
        for (let i = 0; i < 4; i++) {
            scheduler.lastSpawnTime = 0;
            scheduler.nextSpawnDelay = 0;
            scheduler.update(100, (i + 1) * 10000);
            const ac = sm.aircraft[sm.aircraft.length - 1];
            yPositions.push(ac.y);
        }
        // Should span different sectors, not all clustered
        const min = Math.min(...yPositions);
        const max = Math.max(...yPositions);
        expect(max - min).toBeGreaterThan(50);
    });

    it('congestion increases spawn delay', () => {
        // Spawn first aircraft
        scheduler.update(100, 10000);
        const delay1 = scheduler.nextSpawnDelay;

        // Add more aircraft to increase congestion
        for (let i = 0; i < 6; i++) sm.addAircraft(createAircraft());
        scheduler.lastSpawnTime = 0;
        scheduler.nextSpawnDelay = 0;
        scheduler.update(100, 20000);
        const delay2 = scheduler.nextSpawnDelay;

        // Delay should be larger with more congestion
        expect(delay2).toBeGreaterThan(delay1);
    });

    it('getStats returns correct stats', () => {
        scheduler.update(100, 10000);
        const stats = scheduler.getStats();
        expect(stats.totalSpawned).toBe(1);
        expect(stats.spawnEnabled).toBe(true);
        expect(stats.nextSpawnIn).toBeGreaterThanOrEqual(0);
    });

    it('tracks totalSpawned', () => {
        expect(scheduler.totalSpawned).toBe(0);
        scheduler.update(100, 10000);
        expect(scheduler.totalSpawned).toBe(1);
    });
});
