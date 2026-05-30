// ============================================================================
// Test Setup — Global Vitest Configuration
// ============================================================================
// Mocks the Config singleton so all modules receive valid default config
// values without needing fetch/YAML in a Node test environment.

import { vi, beforeEach } from 'vitest';

// Default configuration that mirrors Config._getDefaults()
const TEST_DEFAULTS = {
    airport: {
        name: "Metro International Airport",
        runways: {
            count: 2, length: 300,
            positions: [
                { id: 1, x: 600, y: 350, angle: 0, label: "RWY 09L" },
                { id: 2, x: 600, y: 500, angle: 0, label: "RWY 09R" }
            ]
        },
        gates: {
            count: 6,
            positions: [
                { id: 1, x: 180, y: 250 }, { id: 2, x: 180, y: 320 },
                { id: 3, x: 180, y: 390 }, { id: 4, x: 180, y: 460 },
                { id: 5, x: 180, y: 530 }, { id: 6, x: 180, y: 600 }
            ]
        },
        taxiway_speed: 1.5,
        terminal: { x: 50, y: 220, width: 120, height: 420 }
    },
    aircraft: {
        spawn_rate: { min: 5000, max: 12000 },
        max_active: 12,
        types: [
            { name: "A320", weight: 30, size: 18, maxSpeed: 4, color: "#00e5ff", engines: "twin-jet" },
            { name: "B737", weight: 28, size: 16, maxSpeed: 4.2, color: "#76ff03", engines: "twin-jet" },
            { name: "B777", weight: 15, size: 22, maxSpeed: 3.5, color: "#ffab00", engines: "twin-jet" },
            { name: "A380", weight: 10, size: 26, maxSpeed: 3.0, color: "#e040fb", engines: "quad-jet" },
            { name: "ATR72", weight: 17, size: 15, maxSpeed: 3.2, color: "#80deea", engines: "turboprop" }
        ],
        fuel: {
            initial_min: 40, initial_max: 100,
            consumption: {
                approaching: 0.12, holding_air: 0.20, landing: 0.10,
                go_around: 0.25, landed: 0.02, taxiing_to_gate: 0.05,
                boarding: 0.00, at_gate: 0.01,
                taxiing_to_runway: 0.05, holding_ground: 0.03,
                takeoff: 0.30, departing: 0.15, removed: 0.00
            },
            emergency_threshold: 15, low_threshold: 25,
            refuel_rate: 0.5, refuel_target_min: 50, refuel_target_max: 100
        }
    },
    collision: {
        warning_distance: 400, avoidance_distance: 150,
        emergency_distance: 80, crash_distance: 15,
        avoidance_force: 4.0, emergency_force: 8.0
    },
    simulation: {
        default_speed: 1, speeds: [0.5, 1, 2, 5],
        canvas_width: 1200, canvas_height: 800,
        approach_zone: { min_x: 900, max_x: 1150, min_y: 100, max_y: 700 },
        departure_zone: { x: 1200, y_min: 100, y_max: 700 }
    },
    ai: {
        decision_interval: 3000, timeout: 10000,
        default_provider: "rule-based"
    }
};

// Mock the Config module
vi.mock('../js/utils/Config.js', () => {
    const config = { ...TEST_DEFAULTS };
    const overrides = {};

    const ConfigMock = {
        _config: config,
        _loaded: true,

        get(path, defaultValue = undefined) {
            if (path in overrides) return overrides[path];
            const keys = path.split('.');
            let current = config;
            for (const key of keys) {
                if (current === undefined || current === null) return defaultValue;
                current = current[key];
            }
            return current !== undefined ? current : defaultValue;
        },

        set(path, value) {
            overrides[path] = value;
        },

        clearOverrides() {
            for (const key of Object.keys(overrides)) delete overrides[key];
        },

        get isLoaded() { return true; },

        async load() { /* no-op in tests */ },

        getAll() { return { ...config }; },

        // Expose for test inspection
        _overrides: overrides,
        _defaults: TEST_DEFAULTS,
    };

    return { default: ConfigMock };
});
