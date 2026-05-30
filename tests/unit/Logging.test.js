// ============================================================================
// Logging.test.js — Tests for DecisionLogger, CrashAnalyzer, PerformanceTracker
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionLogger } from '../../js/logging/DecisionLogger.js';
import { CrashAnalyzer } from '../../js/logging/CrashAnalyzer.js';
import { PerformanceTracker } from '../../js/logging/PerformanceTracker.js';

// ─── DecisionLogger ──────────────────────────────────────────────────────────

describe('DecisionLogger', () => {
    let logger;

    beforeEach(() => {
        logger = new DecisionLogger();
    });

    it('logDecision stores entry and emits event', () => {
        const handler = vi.fn();
        logger.on('decision', handler);

        const id = logger.logDecision('TestAI', {
            aircraftId: 'ac1', action: 'HOLD', parameters: {}, reasoning: 'test',
        }, 150);

        expect(logger.decisions).toHaveLength(1);
        expect(logger.decisions[0].provider).toBe('TestAI');
        expect(logger.decisions[0].responseTime).toBe(150);
        expect(handler).toHaveBeenCalled();
        expect(id).toBe(0);
    });

    it('caps at maxEntries (500)', () => {
        for (let i = 0; i < 510; i++) {
            logger.logDecision('AI', { aircraftId: 'ac', action: 'HOLD' }, 10);
        }
        expect(logger.decisions.length).toBeLessThanOrEqual(500);
    });

    it('logEvent stores events with severity', () => {
        const handler = vi.fn();
        logger.on('event', handler);
        logger.logEvent('crash', { test: true }, 'critical');
        expect(logger.events).toHaveLength(1);
        expect(logger.events[0].severity).toBe('critical');
        expect(handler).toHaveBeenCalled();
    });

    it('getRecentDecisions returns last N', () => {
        for (let i = 0; i < 30; i++) {
            logger.logDecision('AI', { aircraftId: `ac${i}`, action: 'HOLD' }, 10);
        }
        const recent = logger.getRecentDecisions(5);
        expect(recent).toHaveLength(5);
        expect(recent[4].aircraftId).toBe('ac29');
    });

    it('getDecisionsByProvider filters correctly', () => {
        logger.logDecision('AI-A', { aircraftId: 'ac1', action: 'HOLD' }, 10);
        logger.logDecision('AI-B', { aircraftId: 'ac2', action: 'HOLD' }, 10);
        logger.logDecision('AI-A', { aircraftId: 'ac3', action: 'HOLD' }, 10);
        expect(logger.getDecisionsByProvider('AI-A')).toHaveLength(2);
        expect(logger.getDecisionsByProvider('AI-B')).toHaveLength(1);
    });

    it('exportJSON returns valid JSON', () => {
        logger.logDecision('AI', { aircraftId: 'ac1', action: 'HOLD' }, 10);
        logger.logEvent('test', {}, 'info');
        const json = logger.exportJSON();
        const parsed = JSON.parse(json);
        expect(parsed.decisions).toHaveLength(1);
        expect(parsed.events).toHaveLength(1);
    });

    it('clear empties both arrays', () => {
        logger.logDecision('AI', { aircraftId: 'ac1', action: 'HOLD' }, 10);
        logger.logEvent('test', {}, 'info');
        logger.clear();
        expect(logger.decisions).toHaveLength(0);
        expect(logger.events).toHaveLength(0);
    });
});

// ─── CrashAnalyzer ───────────────────────────────────────────────────────────

describe('CrashAnalyzer', () => {
    let logger, analyzer;

    beforeEach(() => {
        logger = new DecisionLogger();
        analyzer = new CrashAnalyzer(logger);
    });

    function makeCrashEvent(overrides = {}) {
        return {
            time: Date.now(),
            aircraftA: {
                id: 'a1', callsign: 'TST1', state: 'approaching',
                fuelEmergency: false, collisionAvoidanceActive: false,
                goAroundCount: 0, assignedRunway: 1,
            },
            aircraftB: {
                id: 'a2', callsign: 'TST2', state: 'approaching',
                fuelEmergency: false, collisionAvoidanceActive: false,
                goAroundCount: 0, assignedRunway: 2,
            },
            distance: 5,
            type: 'collision',
            ...overrides,
        };
    }

    it('identifies fuel emergency as contributing factor', () => {
        const event = makeCrashEvent();
        event.aircraftA.fuelEmergency = true;
        const report = analyzer.analyzeCrash(event);
        expect(report.contributingFactors.some(f => f.includes('Fuel emergency'))).toBe(true);
    });

    it('identifies same-runway assignment', () => {
        const event = makeCrashEvent();
        event.aircraftA.assignedRunway = 1;
        event.aircraftB.assignedRunway = 1;
        const report = analyzer.analyzeCrash(event);
        expect(report.contributingFactors.some(f => f.includes('same runway'))).toBe(true);
    });

    it('identifies dual-landing conflict', () => {
        const event = makeCrashEvent();
        event.aircraftA.state = 'landing';
        event.aircraftB.state = 'landing';
        const report = analyzer.analyzeCrash(event);
        expect(report.contributingFactors.some(f => f.includes('landing simultaneously'))).toBe(true);
    });

    it('identifies collision avoidance failure', () => {
        const event = makeCrashEvent();
        event.aircraftA.collisionAvoidanceActive = true;
        const report = analyzer.analyzeCrash(event);
        expect(report.contributingFactors.some(f => f.includes('avoidance'))).toBe(true);
    });

    it('generates runway conflict recommendation', () => {
        const event = makeCrashEvent();
        event.aircraftA.assignedRunway = 1;
        event.aircraftB.assignedRunway = 1;
        const report = analyzer.analyzeCrash(event);
        expect(report.recommendation).toContain('runway');
    });

    it('default factor when none match', () => {
        const event = makeCrashEvent();
        const report = analyzer.analyzeCrash(event);
        expect(report.contributingFactors).toHaveLength(1);
        expect(report.contributingFactors[0]).toContain('separation');
    });

    it('includes recent decisions for involved aircraft', () => {
        logger.logDecision('AI', { aircraftId: 'a1', action: 'HOLD' }, 10);
        logger.logDecision('AI', { aircraftId: 'unrelated', action: 'HOLD' }, 10);
        const event = makeCrashEvent();
        const report = analyzer.analyzeCrash(event);
        expect(report.recentDecisions).toHaveLength(1);
        expect(report.recentDecisions[0].aircraftId).toBe('a1');
    });

    it('emits crash_report event', () => {
        const handler = vi.fn();
        analyzer.on('crash_report', handler);
        analyzer.analyzeCrash(makeCrashEvent());
        expect(handler).toHaveBeenCalled();
    });

    it('stores reports and tracks count', () => {
        analyzer.analyzeCrash(makeCrashEvent());
        analyzer.analyzeCrash(makeCrashEvent());
        expect(analyzer.getReportCount()).toBe(2);
        expect(analyzer.getReports()).toHaveLength(2);
    });
});

// ─── PerformanceTracker ──────────────────────────────────────────────────────

describe('PerformanceTracker', () => {
    let tracker;

    beforeEach(() => {
        tracker = new PerformanceTracker();
    });

    it('recordLanding increments count and tracks fuel', () => {
        tracker.recordLanding({ fuel: 40, createdAt: Date.now() - 10000 });
        expect(tracker.landings).toBe(1);
        expect(tracker.totalFuelAtLanding).toBe(40);
    });

    it('recordDeparture increments count', () => {
        tracker.recordDeparture({});
        expect(tracker.departures).toBe(1);
    });

    it('getSafetyScore returns 100 with no incidents', () => {
        tracker.recordLanding({ fuel: 50, createdAt: Date.now() });
        expect(tracker.getSafetyScore()).toBe(100);
    });

    it('getSafetyScore decreases with crashes', () => {
        tracker.recordLanding({ fuel: 50, createdAt: Date.now() });
        tracker.recordCrash();
        expect(tracker.getSafetyScore()).toBeLessThan(100);
    });

    it('getSafetyScore weights: crashes > near-misses > go-arounds', () => {
        // Score with 1 crash
        const t1 = new PerformanceTracker();
        t1.recordLanding({ fuel: 50, createdAt: Date.now() });
        t1.recordCrash();
        const crashScore = t1.getSafetyScore();

        // Score with 1 near-miss
        const t2 = new PerformanceTracker();
        t2.recordLanding({ fuel: 50, createdAt: Date.now() });
        t2.recordNearMiss();
        const nearMissScore = t2.getSafetyScore();

        // Score with 1 go-around
        const t3 = new PerformanceTracker();
        t3.recordLanding({ fuel: 50, createdAt: Date.now() });
        t3.recordGoAround();
        const goAroundScore = t3.getSafetyScore();

        expect(crashScore).toBeLessThan(nearMissScore);
        expect(nearMissScore).toBeLessThan(goAroundScore);
    });

    it('getAvgFuelAtLanding calculates correctly', () => {
        tracker.recordLanding({ fuel: 40, createdAt: Date.now() });
        tracker.recordLanding({ fuel: 60, createdAt: Date.now() });
        expect(tracker.getAvgFuelAtLanding()).toBe(50);
    });

    it('getAvgLandingTime calculates correctly', () => {
        // Simulate aircraft created 10s ago
        const now = Date.now();
        tracker.recordLanding({ fuel: 50, createdAt: now - 10000 });
        tracker.recordLanding({ fuel: 50, createdAt: now - 20000 });
        const avg = tracker.getAvgLandingTime();
        expect(avg).toBeGreaterThan(0);
    });

    it('takeSnapshot throttles to 2s intervals', () => {
        // At time 0: 0 - 0 = 0 < 2000 → skipped (sets startTime=0)
        tracker.takeSnapshot(0);
        expect(tracker._history).toHaveLength(0);

        // At time 500: 500 - 0 = 500 < 2000 → skipped
        tracker.takeSnapshot(500);
        expect(tracker._history).toHaveLength(0);

        // At time 2500: 2500 - 0 = 2500 >= 2000 → creates snapshot
        tracker.takeSnapshot(2500);
        expect(tracker._history).toHaveLength(1);

        // At time 3000: 3000 - 2500 = 500 < 2000 → skipped
        tracker.takeSnapshot(3000);
        expect(tracker._history).toHaveLength(1);

        // At time 5000: 5000 - 2500 = 2500 >= 2000 → creates snapshot
        tracker.takeSnapshot(5000);
        expect(tracker._history).toHaveLength(2);
    });

    it('recordProviderDecision tracks stats', () => {
        tracker.recordProviderDecision('TestAI', 100);
        tracker.recordProviderDecision('TestAI', 200);
        expect(tracker.providerStats['TestAI'].decisions).toBe(2);
        expect(tracker.providerStats['TestAI'].totalResponseTime).toBe(300);
    });

    it('reset clears everything', () => {
        tracker.recordLanding({ fuel: 50, createdAt: Date.now() });
        tracker.recordCrash();
        tracker.recordGoAround();
        tracker.reset();
        expect(tracker.landings).toBe(0);
        expect(tracker.crashes).toBe(0);
        expect(tracker.goArounds).toBe(0);
        expect(tracker._history).toHaveLength(0);
    });

    it('getMetrics returns complete metrics object', () => {
        const metrics = tracker.getMetrics();
        const expectedKeys = [
            'elapsed', 'landings', 'departures', 'throughput', 'crashes',
            'goArounds', 'fuelEmergencies', 'nearMisses', 'safetyScore',
            'avgFuelAtLanding', 'avgLandingTime', 'providerStats',
        ];
        for (const key of expectedKeys) {
            expect(metrics).toHaveProperty(key);
        }
    });
});
