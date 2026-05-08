// ============================================================================
// GeminiProvider.js — Google Gemini Integration
// ============================================================================

import { LLMAdapter } from './LLMAdapter.js';

export class GeminiProvider extends LLMAdapter {
    constructor(apiKey, model = 'gemini-2.5-flash') {
        super(`Google ${model}`, model);
        this.apiKey = apiKey;
    }

    async getDecisions(state) {
        if (!this.apiKey) return [];
        const start = performance.now();
        try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent?key=${this.apiKey}`;
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: this._buildSystemPrompt() + '\n\n' + this._buildUserPrompt(state) }] }],
                    generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
                })
            });
            const data = await resp.json();
            this._trackResponseTime(performance.now() - start);
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                if (data.usageMetadata) this.totalTokens += (data.usageMetadata.promptTokenCount || 0) + (data.usageMetadata.candidatesTokenCount || 0);
                return this._parseResponse(data.candidates[0].content.parts[0].text);
            }
            return [];
        } catch (e) { console.error('[Gemini] Error:', e); this._trackResponseTime(performance.now() - start); return []; }
    }
}
