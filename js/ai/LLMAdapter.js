// ============================================================================
// LLMAdapter.js — Abstract LLM Interface
// ============================================================================

export class LLMAdapter {
    constructor(name, modelId) {
        this.name = name;
        this.modelId = modelId;
        this.totalCalls = 0;
        this.totalTokens = 0;
        this.avgResponseTime = 0;
        this._responseTimes = [];
    }

    async getDecisions(simulationState) {
        throw new Error('getDecisions must be implemented by subclass');
    }

    getName() { return this.name; }
    getModelId() { return this.modelId; }

    _trackResponseTime(ms) {
        this._responseTimes.push(ms);
        if (this._responseTimes.length > 100) this._responseTimes.shift();
        this.avgResponseTime = this._responseTimes.reduce((a, b) => a + b, 0) / this._responseTimes.length;
        this.totalCalls++;
    }

    getStats() {
        const sorted = [...this._responseTimes].sort((a, b) => a - b);
        return {
            name: this.name, modelId: this.modelId, totalCalls: this.totalCalls,
            avgResponseTime: Math.round(this.avgResponseTime),
            p95ResponseTime: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0,
            p99ResponseTime: sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0
        };
    }

    _buildSystemPrompt() {
        return `You are an expert Air Traffic Controller managing a busy airport. Your job is to safely and efficiently manage all aircraft in your airspace.

PRIORITIES:
1. COLLISION AVOIDANCE - Prevent collisions at all costs. If collision warning is active, respond immediately.
2. FUEL EMERGENCIES - Aircraft with fuel < 15% are CRITICAL and need immediate landing.
3. SAFETY - Maintain safe separation and handle fuel warnings (< 25%).
4. EFFICIENCY - Minimize delays and optimize throughput.
5. FAIRNESS - First-come-first-served when safety allows.

AVAILABLE ACTIONS:
- ASSIGN_RUNWAY: Assign a runway to an approaching aircraft. Parameters: { "runwayId": <number> }
- ASSIGN_GATE: Assign a gate to a landed aircraft. Parameters: { "gateId": <number> }
- HOLD: Tell aircraft to enter/continue holding pattern. Parameters: { "reason": "<string>" }
- CLEAR_LANDING: Clear aircraft for landing. Parameters: { "runwayId": <number> }
- CLEAR_TAKEOFF: Clear aircraft for takeoff. Parameters: { "runwayId": <number> }
- GO_AROUND: Instruct aircraft to abort landing. Parameters: { "reason": "<string>" }
- PRIORITY_LANDING: Emergency priority landing. Parameters: { "runwayId": <number> }
- START_DEPARTURE: Start departure sequence from gate. Parameters: { "runwayId": <number> }
- EXPEDITE: Tell aircraft to speed up. Parameters: { "reason": "<string>" }
- COLLISION_AVOIDANCE: Execute collision avoidance maneuver. Parameters: { "targetAircraft": "<callsign>", "action": "climb|descend|turn_left|turn_right" }

RULES:
- Only one aircraft can use a runway at a time
- Fuel emergencies must be handled immediately — never put critical fuel aircraft on HOLD
- Aircraft with fuel < 15% are CRITICAL — clear any runway for them
- Aircraft with fuel < 25% are LOW — prioritize landing, avoid holding patterns
- Aircraft in BOARDING state are loading/unloading passengers — larger aircraft take longer
- Every crash is a FAILURE — prioritize safety above everything

Respond ONLY with a valid JSON array of decisions. Each decision:
{ "aircraftId": "<id>", "action": "<ACTION>", "parameters": { ... }, "reasoning": "<brief explanation>" }

If no action is needed, respond with an empty array: []`;
    }

    _buildUserPrompt(state) {
        let prompt = `Current Airport Status (Time: ${new Date().toISOString()}):\n\n`;
        prompt += `Active Aircraft: ${state.aircraft.length}\n`;
        prompt += `Free Runways: ${state.counts.freeRunways}/${state.runways.length}\n`;
        prompt += `Free Gates: ${state.counts.freeGates}/${state.gates.length}\n\n`;

        // Safety context — crash history feedback
        if (state.safetyContext) {
            const sc = state.safetyContext;
            if (sc.totalCrashes > 0) {
                prompt += `⚠️ CRASH HISTORY: ${sc.totalCrashes} aircraft have crashed this session!\n`;
                if (sc.recentCrashes && sc.recentCrashes.length > 0) {
                    prompt += `Recent crashes: ${sc.recentCrashes.map(c => `${c.callsignA}↔${c.callsignB} (${c.reason})`).join(', ')}\n`;
                }
                prompt += `Learn from these crashes and prevent future ones!\n\n`;
            }
            if (sc.fuelEmergencyCount > 0) {
                prompt += `🚨 ACTIVE FUEL EMERGENCIES: ${sc.fuelEmergencyCount} aircraft with critical fuel (<15%)\n`;
            }
            if (sc.lowFuelCount > 0) {
                prompt += `⚠️ LOW FUEL WARNINGS: ${sc.lowFuelCount} aircraft with low fuel (<25%)\n`;
            }
            if (sc.fuelEmergencyCount > 0 || sc.lowFuelCount > 0) prompt += '\n';
        }

        // Active collision warnings
        if (state.collisionWarnings && state.collisionWarnings.length > 0) {
            prompt += `🚨 ACTIVE COLLISION WARNINGS:\n`;
            for (const cw of state.collisionWarnings) {
                prompt += `- ${cw.level.toUpperCase()}: ${cw.aircraftA} ↔ ${cw.aircraftB} — TAKE IMMEDIATE ACTION!\n`;
            }
            prompt += `COLLISION AVOIDANCE IS TOP PRIORITY! Use COLLISION_AVOIDANCE, GO_AROUND, or HOLD actions immediately!\n\n`;
        }

        if (state.aircraft.length === 0) {
            prompt += 'No aircraft currently active.\n';
            return prompt;
        }

        prompt += 'AIRCRAFT:\n';
        for (const ac of state.aircraft) {
            prompt += `- ${ac.callsign} (${ac.type}): state=${ac.state}, fuel=${ac.fuel}%`;
            if (ac.fuelEmergency) prompt += ' ⚠️FUEL EMERGENCY';
            else if (ac.fuelLow) prompt += ' ⚠️LOW FUEL';
            if (ac.assignedRunway) prompt += `, runway=${ac.assignedRunway}`;
            if (ac.assignedGate) prompt += `, gate=${ac.assignedGate}`;
            if (ac.needsRunway) prompt += ' [NEEDS RUNWAY]';
            if (ac.needsGate) prompt += ' [NEEDS GATE]';
            if (ac.readyForDeparture) prompt += ' [READY FOR DEPARTURE]';
            if (ac.passengers) prompt += `, pax=${ac.passengers}`;
            if (ac.origin && ac.destination) prompt += `, ${ac.origin}→${ac.destination}`;
            if (ac.state === 'boarding') prompt += `, boarding=${Math.round((ac.boardingProgress || 0) * 100)}%`;
            prompt += '\n';
        }

        prompt += '\nRUNWAYS:\n';
        for (const rw of state.runways) {
            prompt += `- ${rw.label}: ${rw.occupied ? `OCCUPIED by ${rw.occupiedBy}` : 'FREE'}\n`;
        }

        prompt += '\nGATES:\n';
        for (const gt of state.gates) {
            prompt += `- Gate ${gt.id}: ${gt.occupied ? `OCCUPIED by ${gt.occupiedBy}` : 'FREE'}\n`;
        }

        return prompt;
    }

    _parseResponse(responseText) {
        try {
            // Extract JSON from response (handle markdown code blocks)
            let json = responseText.trim();
            const match = json.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (match) json = match[1].trim();
            // Try to find array
            const arrMatch = json.match(/\[[\s\S]*\]/);
            if (arrMatch) json = arrMatch[0];
            const decisions = JSON.parse(json);
            if (!Array.isArray(decisions)) return [];
            return decisions.filter(d => d.aircraftId && d.action);
        } catch (e) {
            console.warn('[LLM] Failed to parse response:', e.message);
            return [];
        }
    }
}
