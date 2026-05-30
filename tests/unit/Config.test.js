// ============================================================================
// Config.test.js — Tests for ConfigManager
// ============================================================================

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

// Unmock so this file exercises the real ConfigManager not the test double
// registered in tests/setup.js. vi.unmock() is hoisted before the import below.
vi.unmock('../../js/utils/Config.js');

import Config from '../../js/utils/Config.js';

describe('Config', () => {
    beforeAll(async () => {
        // Stub fetch to fail immediately so load() falls back to _getDefaults().
        // This exercises the real constructor, load() and all instance methods.
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')));
        await Config.load();
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

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
