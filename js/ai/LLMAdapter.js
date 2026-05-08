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
1. SAFETY - Prevent collisions and handle fuel emergencies at all costs.
2. EFFICIENCY - Minimize delays and optimize throughput.
3. FAIRNESS - First-come-first-served when safety allows.

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

RULES:
- Only one aircraft can use a runway at a time
- Fuel emergencies must be handled immediately
- Aircraft with fuel < 15% are CRITICAL — clear any runway for them
- Aircraft with fuel < 25% are LOW — prioritize landing

Respond ONLY with a valid JSON array of decisions. Each decision:
{ "aircraftId": "<id>", "action": "<ACTION>", "parameters": { ... }, "reasoning": "<brief explanation>" }

If no action is needed, respond with an empty array: []`;
    }

    _buildUserPrompt(state) {
        let prompt = `Current Airport Status (Time: ${new Date().toISOString()}):\n\n`;
        prompt += `Active Aircraft: ${state.aircraft.length}\n`;
        prompt += `Free Runways: ${state.counts.freeRunways}/${state.runways.length}\n`;
        prompt += `Free Gates: ${state.counts.freeGates}/${state.gates.length}\n\n`;

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
