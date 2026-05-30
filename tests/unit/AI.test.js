// ============================================================================
// AI.test.js — Tests for LLMAdapter and RuleBasedAI
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMAdapter } from '../../js/ai/LLMAdapter.js';
import { RuleBasedAI } from '../../js/ai/RuleBasedAI.js';
import { createSnapshot, createSnapshotAircraft } from '../helpers/testFactories.js';

// ─── LLMAdapter._parseResponse ───────────────────────────────────────────────

describe('LLMAdapter._parseResponse', () => {
    let adapter;

    beforeEach(() => {
        adapter = new LLMAdapter('Test', 'test-v1');
    });

    it('parses clean JSON array', () => {
        const input = '[{"aircraftId":"ac1","action":"HOLD","parameters":{},"reasoning":"test"}]';
        const result = adapter._parseResponse(input);
        expect(result).toHaveLength(1);
        expect(result[0].action).toBe('HOLD');
    });

    it('extracts JSON from markdown code block', () => {
        const input = '```json\n[{"aircraftId":"ac1","action":"HOLD","parameters":{}}]\n```';
        const result = adapter._parseResponse(input);
        expect(result).toHaveLength(1);
    });

    it('extracts JSON from code block without json label', () => {
        const input = '```\n[{"aircraftId":"ac1","action":"HOLD","parameters":{}}]\n```';
        const result = adapter._parseResponse(input);
        expect(result).toHaveLength(1);
    });

    it('handles nested brackets in JSON', () => {
        const input = '[{"aircraftId":"ac1","action":"ASSIGN_RUNWAY","parameters":{"runwayId":1},"reasoning":"test [note]"}]';
        const result = adapter._parseResponse(input);
        expect(result).toHaveLength(1);
        expect(result[0].parameters.runwayId).toBe(1);
    });

    it('returns empty array for non-array JSON', () => {
        const input = '{"not":"an array"}';
        const result = adapter._parseResponse(input);
        expect(result).toEqual([]);
    });

    it('returns empty array for garbage input', () => {
        const result = adapter._parseResponse('not json at all!!!');
        expect(result).toEqual([]);
    });

    it('returns empty array for empty string', () => {
        expect(adapter._parseResponse('')).toEqual([]);
    });

    it('filters decisions without aircraftId or action', () => {
        const input = '[{"aircraftId":"ac1","action":"HOLD"},{"action":"HOLD"},{"aircraftId":"ac2"}]';
        const result = adapter._parseResponse(input);
        expect(result).toHaveLength(1);
        expect(result[0].aircraftId).toBe('ac1');
    });

    it('handles JSON with surrounding text', () => {
        const input = 'Here are my decisions:\n[{"aircraftId":"ac1","action":"HOLD","parameters":{}}]\nHope that helps!';
        const result = adapter._parseResponse(input);
        expect(result).toHaveLength(1);
    });
});

// ─── LLMAdapter._buildUserPrompt ─────────────────────────────────────────────

describe('LLMAdapter._buildUserPrompt', () => {
    let adapter;

    beforeEach(() => {
        adapter = new LLMAdapter('Test', 'test-v1');
    });

    it('includes crash history when crashes exist', () => {
        const state = createSnapshot({
            safetyContext: {
                totalCrashes: 2,
                recentCrashes: [
                    { callsignA: 'AAL100', callsignB: 'UAL200', type: 'collision', reason: 'COLLISION' },
                ],
                fuelEmergencyCount: 0,
                lowFuelCount: 0,
            },
        });
        const prompt = adapter._buildUserPrompt(state);
        expect(prompt).toContain('CRASH HISTORY');
        expect(prompt).toContain('AAL100');
    });

    it('includes collision warnings', () => {
        const state = createSnapshot({
            collisionWarnings: [
                { aircraftA: 'TST1', aircraftB: 'TST2', level: 'emergency' },
            ],
        });
        const prompt = adapter._buildUserPrompt(state);
        expect(prompt).toContain('COLLISION WARNINGS');
        expect(prompt).toContain('EMERGENCY');
    });

    it('includes fuel emergency counts', () => {
        const state = createSnapshot({
            safetyContext: {
                totalCrashes: 0, recentCrashes: [],
                fuelEmergencyCount: 2, lowFuelCount: 3,
            },
        });
        const prompt = adapter._buildUserPrompt(state);
        expect(prompt).toContain('FUEL EMERGENCIES');
        expect(prompt).toContain('LOW FUEL');
    });

    it('shows "No aircraft" for empty state', () => {
        const state = createSnapshot({ aircraft: [] });
        const prompt = adapter._buildUserPrompt(state);
        expect(prompt).toContain('No aircraft');
    });

    it('includes aircraft details', () => {
        const state = createSnapshot({
            aircraft: [createSnapshotAircraft({ callsign: 'DAL500', fuel: 30, fuelLow: true })],
        });
        const prompt = adapter._buildUserPrompt(state);
        expect(prompt).toContain('DAL500');
        expect(prompt).toContain('LOW FUEL');
    });
});

// ─── LLMAdapter stats ────────────────────────────────────────────────────────

describe('LLMAdapter stats', () => {
    it('tracks response times', () => {
        const adapter = new LLMAdapter('Test', 'test-v1');
        adapter._trackResponseTime(100);
        adapter._trackResponseTime(200);
        expect(adapter.totalCalls).toBe(2);
        expect(adapter.avgResponseTime).toBe(150);
    });

    it('getStats returns percentiles', () => {
        const adapter = new LLMAdapter('Test', 'test-v1');
        for (let i = 1; i <= 100; i++) adapter._trackResponseTime(i);
        const stats = adapter.getStats();
        expect(stats.p95ResponseTime).toBe(96);
        expect(stats.totalCalls).toBe(100);
    });

    it('caps response time history at 100', () => {
        const adapter = new LLMAdapter('Test', 'test-v1');
        for (let i = 0; i < 150; i++) adapter._trackResponseTime(i);
        expect(adapter._responseTimes).toHaveLength(100);
    });
});

// ─── RuleBasedAI.getDecisions ────────────────────────────────────────────────

describe('RuleBasedAI.getDecisions', () => {
    let ai;

    beforeEach(() => {
        ai = new RuleBasedAI();
    });

    it('assigns runway to approaching aircraft that needs one', async () => {
        const state = createSnapshot({
            aircraft: [createSnapshotAircraft({ id: 'ac1', needsRunway: true })],
        });
        const decisions = await ai.getDecisions(state);
        const assign = decisions.find(d => d.action === 'ASSIGN_RUNWAY');
        expect(assign).toBeDefined();
        expect(assign.aircraftId).toBe('ac1');
    });

    it('puts aircraft on hold when no runways free', async () => {
        const state = createSnapshot({
            aircraft: [createSnapshotAircraft({ id: 'ac1', needsRunway: true })],
            runways: [
                { id: 1, occupied: true, label: 'RWY 09L' },
                { id: 2, occupied: true, label: 'RWY 09R' },
            ],
        });
        const decisions = await ai.getDecisions(state);
        const hold = decisions.find(d => d.action === 'HOLD');
        expect(hold).toBeDefined();
    });

    it('fuel emergency aircraft get priority (sorted first)', async () => {
        const state = createSnapshot({
            aircraft: [
                createSnapshotAircraft({ id: 'normal', needsRunway: true, fuelEmergency: false, timeInState: 100 }),
                createSnapshotAircraft({ id: 'emergency', needsRunway: true, fuelEmergency: true, fuel: 10, timeInState: 50 }),
            ],
        });
        const decisions = await ai.getDecisions(state);
        // Emergency should get runway first
        const assigns = decisions.filter(d => d.action === 'ASSIGN_RUNWAY');
        expect(assigns[0].aircraftId).toBe('emergency');
    });

    it('assigns gate to landed aircraft that needs one', async () => {
        const state = createSnapshot({
            aircraft: [createSnapshotAircraft({
                id: 'ac1', state: 'landed', needsRunway: false, needsGate: true,
            })],
        });
        const decisions = await ai.getDecisions(state);
        const assign = decisions.find(d => d.action === 'ASSIGN_GATE');
        expect(assign).toBeDefined();
    });

    it('starts departure for ready aircraft', async () => {
        const state = createSnapshot({
            aircraft: [createSnapshotAircraft({
                id: 'ac1', state: 'at_gate', needsRunway: false,
                needsGate: false, readyForDeparture: true,
            })],
        });
        const decisions = await ai.getDecisions(state);
        const depart = decisions.find(d => d.action === 'START_DEPARTURE');
        expect(depart).toBeDefined();
    });

    it('clears holds when runway available', async () => {
        const state = createSnapshot({
            aircraft: [createSnapshotAircraft({
                id: 'ac1', state: 'holding_air', assignedRunway: 1,
                needsRunway: false,
            })],
        });
        const decisions = await ai.getDecisions(state);
        const clear = decisions.find(d => d.action === 'CLEAR_LANDING');
        expect(clear).toBeDefined();
    });

    it('returns empty decisions for empty state', async () => {
        const state = createSnapshot({ aircraft: [] });
        const decisions = await ai.getDecisions(state);
        expect(decisions).toEqual([]);
    });
});
