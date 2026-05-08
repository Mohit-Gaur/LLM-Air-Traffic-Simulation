// ============================================================================
// Config.js — YAML Configuration Loader
// ============================================================================

class ConfigManager {
    constructor() {
        this._config = null;
        this._overrides = {};
        this._loaded = false;
    }

    async load(path = 'config.yaml') {
        try {
            const response = await fetch(path);
            const yamlText = await response.text();
            // Use js-yaml loaded via CDN in index.html
            this._config = window.jsyaml.load(yamlText);
            this._loaded = true;
            console.log('[Config] Loaded configuration:', this._config);
        } catch (error) {
            console.error('[Config] Failed to load config.yaml, using defaults:', error);
            this._config = this._getDefaults();
            this._loaded = true;
        }
    }

    get(path, defaultValue = undefined) {
        // Check overrides first
        if (path in this._overrides) {
            return this._overrides[path];
        }

        if (!this._config) {
            console.warn('[Config] Config not loaded yet, returning default');
            return defaultValue;
        }

        const keys = path.split('.');
        let current = this._config;
        for (const key of keys) {
            if (current === undefined || current === null) return defaultValue;
            current = current[key];
        }
        return current !== undefined ? current : defaultValue;
    }

    set(path, value) {
        this._overrides[path] = value;
    }

    clearOverrides() {
        this._overrides = {};
    }

    get isLoaded() {
        return this._loaded;
    }

    getAll() {
        return { ...this._config };
    }

    _getDefaults() {
        return {
            airport: {
                name: "Metro International Airport",
                runways: {
                    count: 2,
                    length: 300,
                    positions: [
                        { id: 1, x: 600, y: 350, angle: 0, label: "RWY 09L" },
                        { id: 2, x: 600, y: 500, angle: 0, label: "RWY 09R" }
                    ]
                },
                gates: {
                    count: 6,
                    positions: [
                        { id: 1, x: 180, y: 250 },
                        { id: 2, x: 180, y: 320 },
                        { id: 3, x: 180, y: 390 },
                        { id: 4, x: 180, y: 460 },
                        { id: 5, x: 180, y: 530 },
                        { id: 6, x: 180, y: 600 }
                    ]
                },
                taxiway_speed: 1.5,
                terminal: { x: 50, y: 220, width: 120, height: 420 }
            },
            aircraft: {
                spawn_rate: { min: 4000, max: 9000 },
                max_active: 15,
                types: [
                    { name: "A320", weight: 40, size: 18, maxSpeed: 4, color: "#00e5ff" },
                    { name: "B737", weight: 35, size: 16, maxSpeed: 4.2, color: "#76ff03" },
                    { name: "B777", weight: 15, size: 22, maxSpeed: 3.5, color: "#ffab00" },
                    { name: "A380", weight: 10, size: 26, maxSpeed: 3.0, color: "#e040fb" }
                ],
                fuel: {
                    initial_min: 40, initial_max: 100,
                    consumption: {
                        approaching: 0.12, holding_air: 0.20, landing: 0.10,
                        landed: 0.02, taxiing_to_gate: 0.05, at_gate: 0.01,
                        taxiing_to_runway: 0.05, holding_ground: 0.03,
                        takeoff: 0.30, departing: 0.15, removed: 0.00
                    },
                    emergency_threshold: 15, low_threshold: 25,
                    refuel_rate: 0.5, refuel_target_min: 50, refuel_target_max: 100
                }
            },
            collision: {
                warning_distance: 500, avoidance_distance: 200,
                emergency_distance: 100, crash_distance: 10,
                avoidance_force: 2.0, emergency_force: 5.0
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
    }
}

// Singleton
const Config = new ConfigManager();
export default Config;
