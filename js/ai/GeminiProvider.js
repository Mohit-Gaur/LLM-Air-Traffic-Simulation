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
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent`;
        return this._callLLM('[Gemini]', endpoint,
            { 'x-goog-api-key': this.apiKey },
            {
                contents: [{ parts: [{ text: this._buildSystemPrompt() + '\n\n' + this._buildUserPrompt(state) }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
            },
            data => ({
                text: data.candidates?.[0]?.content?.parts?.[0]?.text,
                tokens: data.usageMetadata ? (data.usageMetadata.promptTokenCount || 0) + (data.usageMetadata.candidatesTokenCount || 0) : 0
            })
        );
    }
}
