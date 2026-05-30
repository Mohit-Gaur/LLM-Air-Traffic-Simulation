// ============================================================================
// ai-decision-flow.test.js — End-to-end AI decision pipeline
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimulationEngine } from '../../js/engine/SimulationEngine.js';
import { AircraftState } from '../../js/models/Aircraft.js';
import { createAircraft, advanceToState } from '../helpers/testFactories.js';

describe('Integration: AI Decision Flow', () => {
    let engine;

    beforeEach(() => {
        engine = new SimulationEngine();
    });

    it('RuleBasedAI assigns runways and gates through engine pipeline', async () => {
        // Add approaching aircraft
        const ac = createAircraft();
        engine.stateManager.addAircraft(ac);

        // Get AI decisions
        const snapshot = engine.stateManager.getSnapshot();
        const decisions = await engine.currentProvider.getDecisions(snapshot);

        // Should have ASSIGN_RUNWAY decision
        const assignRw = decisions.find(d => d.action === 'ASSIGN_RUNWAY');
        expect(assignRw).toBeDefined();

        // Apply it through the engine
        engine._applyDecision(assignRw);
        expect(ac.assignedRunway).toBeTruthy();
    });

    it('AI handles fuel emergency with priority', async () => {
        // Normal aircraft
        const normal = createAircraft({ fuel: 80 });
        engine.stateManager.addAircraft(normal);

        // Emergency aircraft
        const emergency = createAircraft({ fuel: 10 });
        emergency.fuelEmergency = true;
        emergency.isEmergency = true;
        engine.stateManager.addAircraft(emergency);

        const snapshot = engine.stateManager.getSnapshot();
        const decisions = await engine.currentProvider.getDecisions(snapshot);

        // Apply all decisions
        for (const d of decisions) {
            engine._applyDecision(d);
        }

        // Emergency aircraft should have runway assigned
        expect(emergency.assignedRunway).toBeTruthy();
    });

    it('AI decision with stale callsign is handled gracefully', () => {
        // No aircraft in the engine — simulate a stale decision
        const logSpy = vi.spyOn(engine.logger, 'logEvent');

        engine._applyDecision({
            aircraftId: 'STALE_CALLSIGN',
            action: 'ASSIGN_RUNWAY',
            parameters: { runwayId: 1 },
        });

        // Should not throw, should log failure
        expect(logSpy).toHaveBeenCalledWith(
            'decision_failed',
            expect.objectContaining({ aircraftId: 'STALE_CALLSIGN' }),
            'warning'
        );
    });

    it('AI decisions flow: multiple aircraft get different assignments', async () => {
        const ac1 = createAircraft();
        const ac2 = createAircraft();
        engine.stateManager.addAircraft(ac1);
        engine.stateManager.addAircraft(ac2);

        const snapshot = engine.stateManager.getSnapshot();
        const decisions = await engine.currentProvider.getDecisions(snapshot);

        for (const d of decisions) {
            engine._applyDecision(d);
        }

        // Both should have runways assigned (2 runways available)
        expect(ac1.assignedRunway).toBeTruthy();
        expect(ac2.assignedRunway).toBeTruthy();
        // Should be different runways
        expect(ac1.assignedRunway).not.toBe(ac2.assignedRunway);
    });

    it('AI starts departures for ready aircraft', async () => {
        const ac = createAircraft();
        engine.stateManager.addAircraft(ac);
        advanceToState(ac, AircraftState.AT_GATE);
        ac.stateTimer = 10000;
        ac.isRefueling = false;

        const snapshot = engine.stateManager.getSnapshot();
        const decisions = await engine.currentProvider.getDecisions(snapshot);

        const depart = decisions.find(d => d.action === 'START_DEPARTURE');
        expect(depart).toBeDefined();

        engine._applyDecision(depart);
        expect(ac.state).toBe(AircraftState.TAXIING_TO_RUNWAY);
    });

    it('decision logging tracks all applied decisions', async () => {
        const ac = createAircraft();
        engine.stateManager.addAircraft(ac);

        // Simulate full AI request cycle
        await engine._requestAIDecisions();

        const recentDecisions = engine.logger.getRecentDecisions(10);
        expect(recentDecisions.length).toBeGreaterThanOrEqual(1);
        expect(recentDecisions[0].provider).toBe('Rule Based');
    });

    it('performance tracker records AI response time', async () => {
        const ac = createAircraft();
        engine.stateManager.addAircraft(ac);

        await engine._requestAIDecisions();

        const stats = engine.perfTracker.providerStats;
        expect(stats['Rule Based']).toBeDefined();
        expect(stats['Rule Based'].decisions).toBe(1);
        expect(stats['Rule Based'].totalResponseTime).toBeGreaterThanOrEqual(0);
    });
});
