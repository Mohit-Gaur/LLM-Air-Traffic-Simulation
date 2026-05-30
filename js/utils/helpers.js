// ============================================================================
// helpers.js — Utility functions for the ATC Simulation
// ============================================================================

export const STATE_COLORS = {
    approaching: '#00e5ff',
    holding_air: '#ffc107',
    landing: '#76ff03',
    go_around: '#ff6d00',
    landed: '#8bc34a',
    taxiing_to_gate: '#ff9800',
    boarding: '#f48fb1',
    at_gate: '#9e9e9e',
    taxiing_to_runway: '#ff9800',
    holding_ground: '#ffc107',
    takeoff: '#e040fb',
    departing: '#7c4dff',
    removed: '#444'
};

export function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

export function angle(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
}

export function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * Math.max(0, Math.min(1, t));
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function normalize(vec) {
    const len = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: vec.x / len, y: vec.y / len };
}

export function magnitude(vec) {
    return Math.sqrt(vec.x * vec.x + vec.y * vec.y);
}

export function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

export function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}

// Realistic airline callsign generator
const AIRLINES = [
    { code: 'AAL', name: 'American' },
    { code: 'UAL', name: 'United' },
    { code: 'DAL', name: 'Delta' },
    { code: 'SWA', name: 'Southwest' },
    { code: 'BAW', name: 'British' },
    { code: 'DLH', name: 'Lufthansa' },
    { code: 'AFR', name: 'Air France' },
    { code: 'UAE', name: 'Emirates' },
    { code: 'QFA', name: 'Qantas' },
    { code: 'ANA', name: 'All Nippon' },
    { code: 'SIA', name: 'Singapore' },
    { code: 'KLM', name: 'KLM' },
    { code: 'THY', name: 'Turkish' },
    { code: 'CPA', name: 'Cathay' },
    { code: 'JAL', name: 'Japan Air' },
];

const usedCallsigns = new Set();

export function generateCallsign() {
    let callsign;
    let attempts = 0;
    do {
        const airline = AIRLINES[randomInt(0, AIRLINES.length - 1)];
        const number = randomInt(100, 9999);
        callsign = `${airline.code}${number}`;
        attempts++;
    } while (usedCallsigns.has(callsign) && attempts < 100);
    if (usedCallsigns.has(callsign)) {
        console.warn('[Callsign] Could not generate unique callsign after 100 attempts');
    }
    usedCallsigns.add(callsign);
    return callsign;
}

export function releaseCallsign(callsign) {
    usedCallsigns.delete(callsign);
}

export function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

export function formatTimestamp(date = new Date()) {
    return date.toLocaleTimeString('en-US', { hour12: false }) + '.' +
        String(date.getMilliseconds()).padStart(3, '0');
}

export function throttle(fn, ms) {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= ms) {
            lastCall = now;
            return fn.apply(this, args);
        }
    };
}

export function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

let _uuidCounter = 0;
export function uuid() {
    _uuidCounter++;
    return `ac_${Date.now().toString(36)}_${_uuidCounter.toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
}

export function pickWeighted(items, weightKey = 'weight') {
    const totalWeight = items.reduce((sum, item) => sum + item[weightKey], 0);
    let random = Math.random() * totalWeight;
    for (const item of items) {
        random -= item[weightKey];
        if (random <= 0) return item;
    }
    return items[items.length - 1];
}

// Simple event emitter
export class EventEmitter {
    constructor() {
        this._listeners = {};
    }

    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }

    emit(event, ...args) {
        if (!this._listeners[event]) return;
        for (const callback of this._listeners[event]) {
            try {
                callback(...args);
            } catch (e) {
                console.error(`Event listener error [${event}]:`, e);
            }
        }
    }
}
