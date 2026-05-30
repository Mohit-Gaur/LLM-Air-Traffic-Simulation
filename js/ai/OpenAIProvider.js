// ============================================================================
// OpenAIProvider.js — OpenAI GPT Integration
// ============================================================================

import { LLMAdapter } from './LLMAdapter.js';

export class OpenAIProvider extends LLMAdapter {
    constructor(apiKey, model = 'gpt-4o', baseUrl = 'https://api.openai.com/v1') {
        super(`OpenAI ${model}`, model);
        this.apiKey = apiKey;
        this.endpoint = `${baseUrl}/chat/completions`;
    }

    async getDecisions(state) {
        if (!this.apiKey) return [];
        return this._callLLM('[OpenAI]', this.endpoint,
            { 'Authorization': `Bearer ${this.apiKey}` },
            {
                model: this.modelId, temperature: 0.3, max_tokens: 2000,
                messages: [
                    { role: 'system', content: this._buildSystemPrompt() },
                    { role: 'user', content: this._buildUserPrompt(state) }
                ]
            },
            data => ({
                text: data.choices?.[0]?.message?.content,
                tokens: data.usage?.total_tokens || 0
            })
        );
    }
}
