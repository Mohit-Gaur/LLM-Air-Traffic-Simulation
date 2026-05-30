// ============================================================================
// Config.test.js — Tests for ConfigManager
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import Config from '../../js/utils/Config.js';

describe('Config', () => {
    beforeEach(() => {
        Config.clearOverrides();
    });

    it('is loaded after setup', () => {
        expect(Config.isLoaded).toBe(true);
    });

    it('get() traverses nested paths', () => {
        expect(Config.get('airport.runways.count')).toBe(2);
    });

    it('get() returns deeply nested values', () => {
        const positions = Config.get('airport.runways.positions');
        expect(positions).toHaveLength(2);
        expect(positions[0].label).toBe('RWY 09L');
    });

    it('get() returns default for missing paths', () => {
        expect(Config.get('nonexistent.path', 42)).toBe(42);
    });

    it('get() returns default for partially valid paths', () => {
        expect(Config.get('airport.nonexistent.deep', 'fallback')).toBe('fallback');
    });

    it('set() overrides take priority', () => {
        Config.set('airport.runways.count', 5);
        expect(Config.get('airport.runways.count')).toBe(5);
    });

    it('clearOverrides() restores original values', () => {
        Config.set('airport.runways.count', 99);
        expect(Config.get('airport.runways.count')).toBe(99);
        Config.clearOverrides();
        expect(Config.get('airport.runways.count')).toBe(2);
    });

    it('getAll() returns the full config object', () => {
        const all = Config.getAll();
        expect(all).toHaveProperty('airport');
        expect(all).toHaveProperty('aircraft');
        expect(all).toHaveProperty('collision');
        expect(all).toHaveProperty('simulation');
    });
});
