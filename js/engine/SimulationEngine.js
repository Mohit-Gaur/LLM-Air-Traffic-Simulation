// ============================================================================
// SimulationEngine.js — Main Simulation Loop Coordinator
// ============================================================================

import { StateManager } from './StateManager.js';
import { FlightScheduler } from './FlightScheduler.js';
import { CollisionSystem } from './CollisionSystem.js';
import { FuelSystem } from './FuelSystem.js';
import { DecisionLogger } from '../logging/DecisionLogger.js';
import { CrashAnalyzer } from '../logging/CrashAnalyzer.js';
import { PerformanceTracker } from '../logging/PerformanceTracker.js';
import { RuleBasedAI } from '../ai/RuleBasedAI.js';
import { OpenAIProvider } from '../ai/OpenAIProvider.js';
import { AnthropicProvider } from '../ai/AnthropicProvider.js';
import { GeminiProvider } from '../ai/GeminiProvider.js';
import { OllamaProvider } from '../ai/OllamaProvider.js';
import { AzureAIProvider } from '../ai/AzureAIProvider.js';
import Config from '../utils/Config.js';
import { EventEmitter } from '../utils/helpers.js';

export class SimulationEngine extends EventEmitter {
    constructor() {
        super();
        this.stateManager = new StateManager();
        this.scheduler = new FlightScheduler(this.stateManager);
        this.collisionSystem = new CollisionSystem(this.stateManager);
        this.fuelSystem = new FuelSystem(this.stateManager);
        this.logger = new DecisionLogger();
        this.crashAnalyzer = new CrashAnalyzer(this.logger);
        this.perfTracker = new PerformanceTracker();

        // AI providers
        this.providers = { 'rule-based': new RuleBasedAI() };
        this.currentProvider = this.providers['rule-based'];

        // Timing
        this.running = false;
        this.paused = false;
        this.speed = Config.get('simulation.default_speed', 1);
        this.lastTimestamp = 0;
        this.simulationTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        this._fpsCounter = 0;
        this._fpsTimer = 0;

        // AI decision timing
        this.lastAICall = 0;
        this.aiInterval = Config.get('ai.decision_interval', 3000);
        this.aiPending = false;

        // Renderer reference (set from outside)
        this.renderer = null;
        this.controlPanel = null;

        this._setupEventListeners();
    }

    _setupEventListeners() {
        // Track performance events
        this.stateManager.on('aircraft_landed', (ac) => this.perfTracker.recordLanding(ac));
        this.stateManager.on('aircraft_departed', (ac) => this.perfTracker.recordDeparture(ac));

        // Collision events
        this.collisionSystem.on('crash', (event) => {
            this.perfTracker.recordCrash();
            this.crashAnalyzer.analyzeCrash(event);
            this.logger.logEvent('crash', event, 'critical');
            // Record in state manager for AI context with reason
            this.stateManager.recordCrash({ ...event, reason: 'COLLISION' });
            this.emit('crash', event);
        });
        this.collisionSystem.on('warning', (w) => {
            if (w.level === 'emergency') this.perfTracker.recordNearMiss();
        });
        this.collisionSystem.on('go_around_collision', (data) => {
            this.perfTracker.recordGoAround();
            this.logger.logEvent('go_around', data, 'warning');
        });

        // Fuel events
        this.fuelSystem.on('fuel_emergency', (ac) => {
            this.perfTracker.recordFuelEmergency();
            this.logger.logEvent('fuel_emergency', { callsign: ac.callsign, fuel: ac.fuel }, 'critical');
            this.emit('fuel_emergency', ac);
        });
        this.fuelSystem.on('fuel_low', (ac) => {
            this.logger.logEvent('fuel_low', { callsign: ac.callsign, fuel: ac.fuel }, 'warning');
        });
        this.fuelSystem.on('runway_cleared', (data) => {
            this.logger.logEvent('runway_cleared', data, 'warning');
        });
        this.fuelSystem.on('fuel_exhausted', (ac) => {
            this.logger.logEvent('fuel_exhausted', { callsign: ac.callsign }, 'critical');
            // Tag crash reason before removal
            ac.crashReason = 'FUEL_DEPLETION';
            this.stateManager.recordCrash({
                type: 'fuel_depletion',
                reason: 'FUEL_DEPLETION',
                aircraftA: ac.getStatusSnapshot(),
                aircraftB: null
            });
            this.stateManager.removeAircraft(ac);
            this.perfTracker.recordCrash();
        });

        // Scheduler events
        this.scheduler.on('aircraft_spawned', (ac) => {
            this.logger.logEvent('spawn', { callsign: ac.callsign, type: ac.type, fuel: ac.fuel }, 'info');
        });
    }

    registerProvider(key, provider) {
        this.providers[key] = provider;
    }

    setProvider(key) {
        if (this.providers[key]) {
            this.currentProvider = this.providers[key];
            this.logger.logEvent('provider_switch', { provider: key }, 'info');
            this.emit('provider_changed', key);
            return true;
        }
        return false;
    }

    setupLLMProvider(type, apiKey, model, endpoint) {
        let provider;
        switch (type) {
            case 'openai':
                provider = new OpenAIProvider(apiKey, model || 'gpt-4o');
                this.registerProvider('openai', provider);
                break;
            case 'anthropic':
                provider = new AnthropicProvider(apiKey, model || 'claude-sonnet-4-20250514');
                this.registerProvider('anthropic', provider);
                break;
            case 'gemini':
                provider = new GeminiProvider(apiKey, model || 'gemini-2.5-flash');
                this.registerProvider('gemini', provider);
                break;
            case 'ollama':
                provider = new OllamaProvider(apiKey || 'http://localhost:11434', model || 'llama3.1');
                this.registerProvider('ollama', provider);
                break;
            case 'lmstudio':
                provider = new OpenAIProvider('lm-studio', model || 'local-model', 'http://localhost:1234/v1');
                this.registerProvider('lmstudio', provider);
                break;
            case 'azure-ai':
                provider = new AzureAIProvider(endpoint, apiKey, model || 'gpt-4o');
                this.registerProvider('azure-ai', provider);
                break;
        }
        return provider;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.paused = false;
        this.lastTimestamp = performance.now();
        this.perfTracker.startTime = Date.now();
        this.emit('started');
        this._tick(performance.now());
    }

    pause() { this.paused = true; this.emit('paused'); }
    resume() { this.paused = false; this.lastTimestamp = performance.now(); this.emit('resumed'); }
    togglePause() { this.paused ? this.resume() : this.pause(); }

    setSpeed(speed) { this.speed = speed; this.emit('speed_changed', speed); }

    reset() {
        this.running = false;
        this.paused = false;
        // Remove all aircraft
        for (const ac of [...this.stateManager.aircraft]) {
            this.stateManager.removeAircraft(ac);
        }
        this.stateManager._initAirport();
        this.perfTracker.reset();
        this.logger.clear();
        this.crashAnalyzer.reports = [];
        this.simulationTime = 0;
        this.frameCount = 0;
        this.lastAICall = 0;
        this.emit('reset');
    }

    _tick(timestamp) {
        if (!this.running) return;
        requestAnimationFrame((ts) => this._tick(ts));

        if (this.paused) return;

        const rawDelta = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        // Cap delta to prevent spiral of death
        const cappedDelta = Math.min(rawDelta, 100);
        const deltaTime = cappedDelta * this.speed;
        this.simulationTime += deltaTime;

        // FPS tracking
        this._fpsCounter++;
        this._fpsTimer += rawDelta;
        if (this._fpsTimer >= 1000) {
            this.fps = this._fpsCounter;
            this._fpsCounter = 0;
            this._fpsTimer = 0;
        }

        // 1. Spawn aircraft
        this.scheduler.update(deltaTime, this.simulationTime);

        // 2. Update aircraft physics
        for (const ac of this.stateManager.aircraft) {
            ac.update(deltaTime);
        }

        // 3. Process state transitions
        this.stateManager.update(deltaTime);

        // 4. Fuel management
        this.fuelSystem.update(deltaTime);

        // 5. Collision detection (also updates warnings for AI)
        this.collisionSystem.update(deltaTime);
        // Pipe active collision warnings into state manager for AI prompt enrichment
        this.stateManager.setCollisionWarnings(this.collisionSystem.getWarnings());

        // 6. AI decisions (throttled)
        if (this.simulationTime - this.lastAICall >= this.aiInterval && !this.aiPending) {
            this._requestAIDecisions();
        }

        // 7. Performance snapshot
        this.perfTracker.takeSnapshot(this.simulationTime);

        // 8. Render
        if (this.renderer) {
            this.renderer.draw(this);
        }

        // 9. Update UI
        if (this.controlPanel) {
            this.controlPanel.update(this);
        }

        this.frameCount++;
    }

    async _requestAIDecisions() {
        this.aiPending = true;
        this.lastAICall = this.simulationTime;

        const snapshot = this.stateManager.getSnapshot();
        const startTime = performance.now();

        try {
            const decisions = await this.currentProvider.getDecisions(snapshot);
            const responseTime = performance.now() - startTime;

            this.perfTracker.recordProviderDecision(
                this.currentProvider.getName(), responseTime
            );

            for (const decision of decisions) {
                this.logger.logDecision(
                    this.currentProvider.getName(), decision, responseTime
                );
                this._applyDecision(decision);
            }
        } catch (e) {
            console.error('[Engine] AI decision error:', e);
            this.logger.logEvent('ai_error', { error: e.message }, 'error');
        }

        this.aiPending = false;
    }

    _applyDecision(decision) {
        const { action, parameters } = decision;
        let { aircraftId } = decision;

        // LLMs typically return the callsign (e.g. "DAL7713") since that's what
        // the prompt displays. Resolve it to the internal UUID if needed.
        if (aircraftId && !this.stateManager.getAircraft(aircraftId)) {
            const byCallsign = this.stateManager.getAircraftByCallsign(aircraftId);
            if (byCallsign) aircraftId = byCallsign.id;
        }

        let success = false;

        switch (action) {
            case 'ASSIGN_RUNWAY':
                success = this.stateManager.assignRunway(aircraftId, parameters.runwayId);
                break;
            case 'ASSIGN_GATE':
                success = this.stateManager.assignGate(aircraftId, parameters.gateId);
                break;
            case 'HOLD':
                success = this.stateManager.holdAircraft(aircraftId);
                break;
            case 'CLEAR_LANDING':
            case 'CLEAR_TAKEOFF':
                success = this.stateManager.clearHold(aircraftId);
                break;
            case 'GO_AROUND': {
                const ac = this.stateManager.getAircraft(aircraftId);
                if (ac) { success = ac.startGoAround(); if (success) this.perfTracker.recordGoAround(); }
                break;
            }
            case 'PRIORITY_LANDING':
                success = this.stateManager.assignRunway(aircraftId, parameters.runwayId);
                break;
            case 'START_DEPARTURE':
                success = this.stateManager.startDeparture(aircraftId, parameters.runwayId);
                break;
            case 'COLLISION_AVOIDANCE': {
                const ac = this.stateManager.getAircraft(aircraftId);
                if (ac) {
                    // Apply collision avoidance — force go-around for landing aircraft,
                    // or apply avoidance vector for others
                    if (ac.state === 'landing') {
                        success = ac.startGoAround();
                        if (success) this.perfTracker.recordGoAround();
                    } else {
                        ac.applyAvoidance({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 });
                        success = true;
                    }
                }
                break;
            }
            case 'EXPEDITE': {
                const ac = this.stateManager.getAircraft(aircraftId);
                if (ac) { ac.speed *= 1.3; success = true; }
                break;
            }
        }

        if (!success) {
            this.logger.logEvent('decision_failed', { action, aircraftId, parameters }, 'warning');
        }
    }

    getProviderList() {
        return Object.entries(this.providers).map(([key, p]) => ({
            key, name: p.getName(), modelId: p.getModelId(), stats: p.getStats()
        }));
    }
}
