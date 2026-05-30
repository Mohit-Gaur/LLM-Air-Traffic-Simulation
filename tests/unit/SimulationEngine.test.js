// ============================================================================
// SimulationEngine.test.js — Tests for main simulation coordinator
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationEngine } from '../../js/engine/SimulationEngine.js';
import { AircraftState } from '../../js/models/Aircraft.js';
import { createAircraft } from '../helpers/testFactories.js';

describe('SimulationEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new SimulationEngine();
    });

    // ─── Constructor ─────────────────────────────────────────────────────

    describe('constructor', () => {
        it('creates all subsystems', () => {
            expect(engine.stateManager).toBeDefined();
            expect(engine.scheduler).toBeDefined();
            expect(engine.collisionSystem).toBeDefined();
            expect(engine.fuelSystem).toBeDefined();
            expect(engine.logger).toBeDefined();
            expect(engine.crashAnalyzer).toBeDefined();
            expect(engine.perfTracker).toBeDefined();
        });

        it('starts with rule-based provider', () => {
            expect(engine.currentProvider.getName()).toBe('Rule-Based AI');
        });

        it('starts not running', () => {
            expect(engine.running).toBe(false);
            expect(engine.paused).toBe(false);
        });
    });

    // ─── Provider Management ─────────────────────────────────────────────

    describe('provider management', () => {
        it('registerProvider adds a new provider', () => {
            const mockProvider = { getName: () => 'Mock', getModelId: () => 'mock-v1', getStats: () => ({}) };
            engine.registerProvider('mock', mockProvider);
            expect(engine.setProvider('mock')).toBe(true);
            expect(engine.currentProvider).toBe(mockProvider);
        });

        it('setProvider returns false for unknown provider', () => {
            expect(engine.setProvider('nonexistent')).toBe(false);
        });

        it('setProvider emits provider_changed event', () => {
            const handler = vi.fn();
            engine.on('provider_changed', handler);
            engine.setProvider('rule-based');
            expect(handler).toHaveBeenCalledWith('rule-based');
        });

        it('setupLLMProvider creates OpenAI provider', () => {
            const provider = engine.setupLLMProvider('openai', 'test-key');
            expect(provider).toBeDefined();
            expect(provider.getName()).toContain('OpenAI');
        });

        it('setupLLMProvider creates Anthropic provider', () => {
            const provider = engine.setupLLMProvider('anthropic', 'test-key');
            expect(provider.getName()).toContain('Anthropic');
        });

        it('setupLLMProvider creates Gemini provider', () => {
            const provider = engine.setupLLMProvider('gemini', 'test-key');
            expect(provider.getName()).toContain('Google');
        });

        it('setupLLMProvider creates Azure AI provider', () => {
            const provider = engine.setupLLMProvider('azure-ai', 'test-key', 'gpt-4o', 'https://test.azure.com');
            expect(provider.getName()).toContain('Azure');
        });

        it('getProviderList returns registered providers', () => {
            const list = engine.getProviderList();
            expect(list.length).toBeGreaterThanOrEqual(1);
            expect(list[0].key).toBe('rule-based');
        });
    });

    // ─── Speed Control ───────────────────────────────────────────────────

    describe('speed control', () => {
        it('setSpeed changes speed and emits event', () => {
            const handler = vi.fn();
            engine.on('speed_changed', handler);
            engine.setSpeed(5);
            expect(engine.speed).toBe(5);
            expect(handler).toHaveBeenCalledWith(5);
        });
    });

    // ─── Reset ───────────────────────────────────────────────────────────

    describe('reset', () => {
        it('clears all state', () => {
            // Add some state
            const ac = createAircraft();
            engine.stateManager.addAircraft(ac);
            engine.perfTracker.recordCrash();
            engine.simulationTime = 50000;

            engine.reset();
            expect(engine.stateManager.aircraft).toHaveLength(0);
            expect(engine.running).toBe(false);
            expect(engine.simulationTime).toBe(0);
            expect(engine.perfTracker.crashes).toBe(0);
        });

        it('emits reset event', () => {
            const handler = vi.fn();
            engine.on('reset', handler);
            engine.reset();
            expect(handler).toHaveBeenCalled();
        });
    });

    // ─── _applyDecision ──────────────────────────────────────────────────

    describe('_applyDecision', () => {
        let ac;

        beforeEach(() => {
            ac = createAircraft();
            engine.stateManager.addAircraft(ac);
        });

        it('ASSIGN_RUNWAY assigns runway', () => {
            engine._applyDecision({
                aircraftId: ac.id,
                action: 'ASSIGN_RUNWAY',
                parameters: { runwayId: 1 },
            });
            expect(ac.assignedRunway).toBe(1);
        });

        it('ASSIGN_GATE assigns gate', () => {
            engine._applyDecision({
                aircraftId: ac.id,
                action: 'ASSIGN_GATE',
                parameters: { gateId: 1 },
            });
            expect(ac.assignedGate).toBe(1);
        });

        it('HOLD puts aircraft in hold', () => {
            engine._applyDecision({
                aircraftId: ac.id,
                action: 'HOLD',
                parameters: {},
            });
            expect(ac.state).toBe(AircraftState.HOLDING_AIR);
        });

        it('GO_AROUND calls startGoAround on landing aircraft', () => {
            ac.setState(AircraftState.LANDING);
            engine._applyDecision({
                aircraftId: ac.id,
                action: 'GO_AROUND',
                parameters: {},
            });
            expect(ac.state).toBe(AircraftState.GO_AROUND);
        });

        it('COLLISION_AVOIDANCE on landing aircraft triggers go-around', () => {
            ac.setState(AircraftState.LANDING);
            engine._applyDecision({
                aircraftId: ac.id,
                action: 'COLLISION_AVOIDANCE',
                parameters: {},
            });
            expect(ac.state).toBe(AircraftState.GO_AROUND);
        });

        it('COLLISION_AVOIDANCE on non-landing applies avoidance vector', () => {
            engine._applyDecision({
                aircraftId: ac.id,
                action: 'COLLISION_AVOIDANCE',
                parameters: {},
            });
            expect(ac.collisionAvoidanceActive).toBe(true);
        });

        it('EXPEDITE multiplies speed', () => {
            ac.speedMultiplier = 1.0;
            engine._applyDecision({
                aircraftId: ac.id,
                action: 'EXPEDITE',
                parameters: {},
            });
            expect(ac.speedMultiplier).toBeCloseTo(1.3);
        });

        it('resolves callsign to aircraft ID', () => {
            // Use callsign instead of ID
            engine._applyDecision({
                aircraftId: ac.callsign,
                action: 'ASSIGN_RUNWAY',
                parameters: { runwayId: 1 },
            });
            expect(ac.assignedRunway).toBe(1);
        });

        it('logs failure for invalid action target', () => {
            const spy = vi.spyOn(engine.logger, 'logEvent');
            engine._applyDecision({
                aircraftId: 'nonexistent',
                action: 'ASSIGN_RUNWAY',
                parameters: { runwayId: 1 },
            });
            expect(spy).toHaveBeenCalledWith(
                'decision_failed',
                expect.any(Object),
                'warning'
            );
        });
    });

    // ─── Event Wiring ────────────────────────────────────────────────────

    describe('event wiring', () => {
        it('collision crash → perfTracker + crashAnalyzer + logger', () => {
            const crashSpy = vi.spyOn(engine.perfTracker, 'recordCrash');
            const analyzeSpy = vi.spyOn(engine.crashAnalyzer, 'analyzeCrash');
            const logSpy = vi.spyOn(engine.logger, 'logEvent');

            const crashEvent = {
                time: Date.now(),
                aircraftA: { callsign: 'TST1', state: 'approaching' },
                aircraftB: { callsign: 'TST2', state: 'approaching' },
                distance: 5,
                type: 'collision',
            };
            engine.collisionSystem.emit('crash', crashEvent);

            expect(crashSpy).toHaveBeenCalled();
            expect(analyzeSpy).toHaveBeenCalledWith(crashEvent);
            expect(logSpy).toHaveBeenCalledWith('crash', crashEvent, 'critical');
        });

        it('fuel_exhausted → logs and records crash', () => {
            const ac = createAircraft({ fuel: 0 });
            ac.state = AircraftState.APPROACHING;
            engine.stateManager.addAircraft(ac);

            const logSpy = vi.spyOn(engine.logger, 'logEvent');
            engine.fuelSystem.emit('fuel_exhausted', ac);

            expect(logSpy).toHaveBeenCalledWith('fuel_exhausted', expect.any(Object), 'critical');
            expect(ac.crashReason).toBe('FUEL_DEPLETION');
        });

        it('fuel_emergency → perfTracker + logger', () => {
            const ac = createAircraft({ fuel: 10 });
            engine.stateManager.addAircraft(ac);

            const emergSpy = vi.spyOn(engine.perfTracker, 'recordFuelEmergency');
            const logSpy = vi.spyOn(engine.logger, 'logEvent');
            engine.fuelSystem.emit('fuel_emergency', ac);

            expect(emergSpy).toHaveBeenCalled();
            expect(logSpy).toHaveBeenCalledWith('fuel_emergency', expect.any(Object), 'critical');
        });
    });
});
