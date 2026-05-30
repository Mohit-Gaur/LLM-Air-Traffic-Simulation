// ============================================================================
// DecisionLogger.js — AI Decision Logging
// ============================================================================

import { formatTimestamp } from '../utils/helpers.js';
import { EventEmitter } from '../utils/helpers.js';

export class DecisionLogger extends EventEmitter {
    constructor() {
        super();
        this.decisions = [];
        this.events = [];
        this.maxEntries = 500;
    }

    logDecision(provider, decision, responseTime, stateHash = '') {
        const entry = {
            id: this.decisions.length,
            timestamp: Date.now(),
            timeStr: formatTimestamp(),
            provider: provider,
            aircraftId: decision.aircraftId,
            action: decision.action,
            parameters: decision.parameters,
            reasoning: decision.reasoning || '',
            responseTime: Math.round(responseTime),
            stateHash: stateHash,
            outcome: null
        };
        this.decisions.push(entry);
        if (this.decisions.length > this.maxEntries) this.decisions.shift();
        this.emit('decision', entry);
        return entry.id;
    }

    logEvent(type, data, severity = 'info') {
        const entry = {
            id: this.events.length,
            timestamp: Date.now(),
            timeStr: formatTimestamp(),
            type: type,
            data: data,
            severity: severity
        };
        this.events.push(entry);
        if (this.events.length > this.maxEntries) this.events.shift();
        this.emit('event', entry);
    }

    getRecentDecisions(count = 20) { return this.decisions.slice(-count); }
    getRecentEvents(count = 20) { return this.events.slice(-count); }
    getDecisionsByProvider(provider) { return this.decisions.filter(d => d.provider === provider); }

    exportJSON() {
        return JSON.stringify({ decisions: this.decisions, events: this.events }, null, 2);
    }

    clear() { this.decisions = []; this.events = []; }
}
