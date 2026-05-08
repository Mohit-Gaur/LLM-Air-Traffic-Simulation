// ============================================================================
// AnthropicProvider.js — Anthropic Claude Integration
// ============================================================================

import { LLMAdapter } from './LLMAdapter.js';

export class AnthropicProvider extends LLMAdapter {
    constructor(apiKey, model = 'claude-sonnet-4-20250514') {
        super(`Anthropic ${model}`, model);
        this.apiKey = apiKey;
        this.endpoint = 'https://api.anthropic.com/v1/messages';
    }

    async getDecisions(state) {
        if (!this.apiKey) return [];
        const start = performance.now();
        try {
            const resp = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json', 'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: this.modelId, max_tokens: 2000, temperature: 0.3,
                    system: this._buildSystemPrompt(),
                    messages: [{ role: 'user', content: this._buildUserPrompt(state) }]
                })
            });
            const data = await resp.json();
            this._trackResponseTime(performance.now() - start);
            if (data.content?.[0]?.text) {
                if (data.usage) this.totalTokens += (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
                return this._parseResponse(data.content[0].text);
            }
            return [];
        } catch (e) { console.error('[Anthropic] Error:', e); this._trackResponseTime(performance.now() - start); return []; }
    }
}
