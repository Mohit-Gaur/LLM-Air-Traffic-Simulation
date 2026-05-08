// ============================================================================
// OpenAIProvider.js — OpenAI GPT Integration
// ============================================================================

import { LLMAdapter } from './LLMAdapter.js';

export class OpenAIProvider extends LLMAdapter {
    constructor(apiKey, model = 'gpt-4o') {
        super(`OpenAI ${model}`, model);
        this.apiKey = apiKey;
        this.endpoint = 'https://api.openai.com/v1/chat/completions';
    }

    async getDecisions(state) {
        if (!this.apiKey) return [];
        const start = performance.now();
        try {
            const resp = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
                body: JSON.stringify({
                    model: this.modelId, temperature: 0.3, max_tokens: 2000,
                    messages: [
                        { role: 'system', content: this._buildSystemPrompt() },
                        { role: 'user', content: this._buildUserPrompt(state) }
                    ]
                })
            });
            const data = await resp.json();
            this._trackResponseTime(performance.now() - start);
            if (data.choices?.[0]?.message?.content) {
                if (data.usage) this.totalTokens += data.usage.total_tokens;
                return this._parseResponse(data.choices[0].message.content);
            }
            return [];
        } catch (e) { console.error('[OpenAI] Error:', e); this._trackResponseTime(performance.now() - start); return []; }
    }
}
