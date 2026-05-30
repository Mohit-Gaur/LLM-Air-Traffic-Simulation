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
        return this._callLLM('[Anthropic]', this.endpoint,
            {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            {
                model: this.modelId, max_tokens: 2000, temperature: 0.3,
                system: this._buildSystemPrompt(),
                messages: [{ role: 'user', content: this._buildUserPrompt(state) }]
            },
            data => ({
                text: data.content?.[0]?.text,
                tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
            })
        );
    }
}
