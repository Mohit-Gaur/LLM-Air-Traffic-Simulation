// ============================================================================
// CrashAnalyzer.js — Post-Crash Root Cause Analysis
// ============================================================================

import { formatTimestamp, formatTime } from '../utils/helpers.js';
import { EventEmitter } from '../utils/helpers.js';

export class CrashAnalyzer extends EventEmitter {
    constructor(decisionLogger) {
        super();
        this.logger = decisionLogger;
        this.reports = [];
    }

    analyzeCrash(crashEvent) {
        const report = {
            id: this.reports.length,
            timestamp: crashEvent.time,
            timeStr: formatTimestamp(new Date(crashEvent.time)),
            aircraftA: crashEvent.aircraftA,
            aircraftB: crashEvent.aircraftB,
            distance: crashEvent.distance,
            contributingFactors: [],
            recentDecisions: [],
            recommendation: ''
        };

        // Identify contributing factors
        const a = crashEvent.aircraftA, b = crashEvent.aircraftB;

        if (a.fuelEmergency || b.fuelEmergency) {
            report.contributingFactors.push('Fuel emergency may have forced unsafe maneuvers');
        }
        if (a.collisionAvoidanceActive || b.collisionAvoidanceActive) {
            report.contributingFactors.push('Collision avoidance was active but failed to prevent crash');
        }
        if (a.state === 'landing' && b.state === 'landing') {
            report.contributingFactors.push('Both aircraft were landing simultaneously — runway conflict');
        }
        if (a.state === 'landing' && b.state === 'takeoff' || a.state === 'takeoff' && b.state === 'landing') {
            report.contributingFactors.push('Landing/takeoff conflict on same runway');
        }
        if (a.goAroundCount > 0 || b.goAroundCount > 0) {
            report.contributingFactors.push('Go-around maneuver may have contributed to conflict');
        }
        if (a.assignedRunway === b.assignedRunway && a.assignedRunway) {
            report.contributingFactors.push(`Both aircraft assigned to same runway (${a.assignedRunway})`);
        }
        if (report.contributingFactors.length === 0) {
            report.contributingFactors.push('Insufficient separation maintained');
        }

        // Get recent decisions involving these aircraft
        const recent = this.logger.getRecentDecisions(50);
        report.recentDecisions = recent.filter(d =>
            d.aircraftId === a.id || d.aircraftId === b.id
        ).slice(-10);

        // Generate recommendation
        report.recommendation = this._generateRecommendation(report);

        this.reports.push(report);
        this.emit('crash_report', report);
        return report;
    }

    _generateRecommendation(report) {
        const factors = report.contributingFactors;
        if (factors.some(f => f.includes('runway conflict') || f.includes('same runway'))) {
            return 'Improve runway assignment logic — ensure mutual exclusion on runway usage';
        }
        if (factors.some(f => f.includes('Fuel emergency'))) {
            return 'Better fuel emergency handling — earlier intervention and dedicated emergency procedures';
        }
        if (factors.some(f => f.includes('avoidance'))) {
            return 'Increase collision avoidance distances or force values';
        }
        return 'Increase separation requirements and improve traffic sequencing';
    }

    getReports() { return [...this.reports]; }
    getReportCount() { return this.reports.length; }
}
