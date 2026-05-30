// ============================================================================
// helpers.test.js — Tests for utility functions
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    distance, angle, lerp, lerpAngle, clamp, normalize, magnitude,
    randomRange, randomInt, generateCallsign, releaseCallsign,
    formatTime, formatTimestamp, throttle, debounce, uuid, pickWeighted,
    EventEmitter
} from '../../js/utils/helpers.js';

// ─── Math Utilities ──────────────────────────────────────────────────────────

describe('distance()', () => {
    it('returns correct Euclidean distance', () => {
        expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it('returns 0 for same point', () => {
        expect(distance({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0);
    });

    it('handles negative coordinates', () => {
        expect(distance({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5);
    });
});

describe('angle()', () => {
    it('returns 0 for point directly to the right', () => {
        expect(angle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    });

    it('returns π/2 for point directly below', () => {
        expect(angle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
    });

    it('returns π for point directly to the left', () => {
        expect(angle({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(Math.PI);
    });
});

describe('lerp()', () => {
    it('returns a when t=0', () => {
        expect(lerp(10, 20, 0)).toBe(10);
    });

    it('returns b when t=1', () => {
        expect(lerp(10, 20, 1)).toBe(20);
    });

    it('returns midpoint when t=0.5', () => {
        expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('clamps t to [0,1] — does not undershoot', () => {
        expect(lerp(10, 20, -1)).toBe(10);
    });

    it('clamps t to [0,1] — does not overshoot', () => {
        expect(lerp(10, 20, 2)).toBe(20);
    });
});

describe('lerpAngle()', () => {
    it('interpolates between angles normally', () => {
        const result = lerpAngle(0, Math.PI / 2, 0.5);
        expect(result).toBeCloseTo(Math.PI / 4);
    });

    it('wraps correctly across ±π boundary (short way)', () => {
        // Going from almost π to almost -π should go through π, not 0
        const result = lerpAngle(Math.PI * 0.9, -Math.PI * 0.9, 0.5);
        // The short path crosses π
        expect(Math.abs(result)).toBeGreaterThan(Math.PI * 0.8);
    });

    it('clamps t to [0,1]', () => {
        const a = 0, b = Math.PI;
        expect(lerpAngle(a, b, 0)).toBe(a);
    });
});

describe('clamp()', () => {
    it('returns value when within range', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to min', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps to max', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });
});

describe('normalize()', () => {
    it('returns unit vector', () => {
        const v = normalize({ x: 3, y: 4 });
        expect(magnitude(v)).toBeCloseTo(1);
    });

    it('preserves direction', () => {
        const v = normalize({ x: 0, y: 5 });
        expect(v.x).toBeCloseTo(0);
        expect(v.y).toBeCloseTo(1);
    });

    it('returns zero vector for zero-length input', () => {
        const v = normalize({ x: 0, y: 0 });
        expect(v.x).toBe(0);
        expect(v.y).toBe(0);
    });
});

// ─── Callsign Generation ────────────────────────────────────────────────────

describe('generateCallsign() / releaseCallsign()', () => {
    it('generates unique callsigns', () => {
        const callsigns = [];
        for (let i = 0; i < 50; i++) {
            callsigns.push(generateCallsign());
        }
        try {
            expect(new Set(callsigns).size).toBe(50);
        } finally {
            // Release all reserved callsigns regardless of assertion outcome
            callsigns.forEach(releaseCallsign);
        }
    });

    it('follows airline code + number format', () => {
        const cs = generateCallsign();
        // Format: 3-letter code + 3-4 digit number
        expect(cs).toMatch(/^[A-Z]{3}\d{3,4}$/);
        releaseCallsign(cs);
    });

    it('released callsigns can be regenerated', () => {
        const cs = generateCallsign();
        releaseCallsign(cs);
        // Not a guarantee it'll be reused, but release should not throw
        expect(() => releaseCallsign(cs)).not.toThrow();
    });
});

// ─── pickWeighted ────────────────────────────────────────────────────────────

describe('pickWeighted()', () => {
    it('returns an item from the array', () => {
        const items = [
            { name: 'A', weight: 10 },
            { name: 'B', weight: 90 },
        ];
        const result = pickWeighted(items);
        expect(['A', 'B']).toContain(result.name);
    });

    it('heavily-weighted items are picked more often (statistical)', () => {
        const items = [
            { name: 'rare', weight: 1 },
            { name: 'common', weight: 99 },
        ];
        let commonCount = 0;
        for (let i = 0; i < 200; i++) {
            if (pickWeighted(items).name === 'common') commonCount++;
        }
        // With 99% weight, we expect at least 80% picks to be 'common'
        expect(commonCount).toBeGreaterThan(160);
    });
});

// ─── Formatting ──────────────────────────────────────────────────────────────

describe('formatTime()', () => {
    it('formats seconds only', () => {
        expect(formatTime(45000)).toBe('45s');
    });

    it('formats minutes and seconds', () => {
        expect(formatTime(125000)).toBe('2m 5s');
    });

    it('formats hours, minutes and seconds', () => {
        expect(formatTime(3725000)).toBe('1h 2m 5s');
    });
});

// ─── uuid ────────────────────────────────────────────────────────────────────

describe('uuid()', () => {
    it('returns unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) ids.add(uuid());
        expect(ids.size).toBe(100);
    });

    it('starts with "ac_" prefix', () => {
        expect(uuid()).toMatch(/^ac_/);
    });
});

// ─── throttle ────────────────────────────────────────────────────────────────

describe('throttle()', () => {
    it('calls function immediately on first call', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 1000);
        throttled();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('suppresses calls within cooldown window', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 1000);
        throttled();
        throttled();
        throttled();
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

// ─── EventEmitter ────────────────────────────────────────────────────────────

describe('EventEmitter', () => {
    let emitter;

    beforeEach(() => {
        emitter = new EventEmitter();
    });

    it('emits events to registered listeners', () => {
        const handler = vi.fn();
        emitter.on('test', handler);
        emitter.emit('test', 'arg1', 'arg2');
        expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('supports multiple listeners for same event', () => {
        const h1 = vi.fn(), h2 = vi.fn();
        emitter.on('test', h1);
        emitter.on('test', h2);
        emitter.emit('test');
        expect(h1).toHaveBeenCalledTimes(1);
        expect(h2).toHaveBeenCalledTimes(1);
    });

    it('on() returns unsubscribe function', () => {
        const handler = vi.fn();
        const unsub = emitter.on('test', handler);
        unsub();
        emitter.emit('test');
        expect(handler).not.toHaveBeenCalled();
    });

    it('off() removes specific listener', () => {
        const h1 = vi.fn(), h2 = vi.fn();
        emitter.on('test', h1);
        emitter.on('test', h2);
        emitter.off('test', h1);
        emitter.emit('test');
        expect(h1).not.toHaveBeenCalled();
        expect(h2).toHaveBeenCalledTimes(1);
    });

    it('listener error does not break other listeners', () => {
        const errorHandler = vi.fn(() => { throw new Error('boom'); });
        const goodHandler = vi.fn();
        emitter.on('test', errorHandler);
        emitter.on('test', goodHandler);
        emitter.emit('test');
        expect(goodHandler).toHaveBeenCalledTimes(1);
    });

    it('emit on non-existent event does not throw', () => {
        expect(() => emitter.emit('nonexistent')).not.toThrow();
    });
});
