// ============================================================================
// AzureAIProvider.js — Azure AI Foundry Integration
// Supports both Azure OpenAI v1 and Azure AI Model Inference endpoints
// ============================================================================

import { LLMAdapter } from './LLMAdapter.js';

export class AzureAIProvider extends LLMAdapter {
    constructor(endpoint, apiKey, deploymentName = 'gpt-4o') {
        super(`Azure AI ${deploymentName}`, deploymentName);
        this.apiKey = apiKey;
        this.baseEndpoint = endpoint.replace(/\/+$/, '');

        // If the user provided a full URL ending in /chat/completions, use it as-is
        if (this.baseEndpoint.includes('/chat/completions')) {
            this.chatUrl = this.baseEndpoint;
        } else if (this.baseEndpoint.includes('/openai/v1')) {
            // Base includes /openai/v1 but not the full path — append the rest
            this.chatUrl = `${this.baseEndpoint}/chat/completions`;
        } else if (this.baseEndpoint.includes('.openai.azure.com')) {
            // Azure OpenAI resource — use v1 path
            this.chatUrl = `${this.baseEndpoint}/openai/v1/chat/completions`;
        } else if (this.baseEndpoint.includes('.services.ai.azure.com')) {
            // Azure AI Foundry services — use v1 path (works for both OpenAI and Foundry models)
            this.chatUrl = `${this.baseEndpoint}/openai/v1/chat/completions`;
        } else {
            // Custom / generic endpoint — assume OpenAI-compatible
            this.chatUrl = `${this.baseEndpoint}/chat/completions`;
        }

        // Auth: Azure endpoints use Bearer token with the v1 API
        this.authHeaders = { 'Authorization': `Bearer ${this.apiKey}` };
    }

    async getDecisions(state) {
        if (!this.apiKey) return [];
        const start = performance.now();
        try {
            const resp = await fetch(this.chatUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.authHeaders },
                body: JSON.stringify({
                    model: this.modelId,
                    temperature: 0.3,
                    max_completion_tokens: 2000,
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
            if (data.error) {
                console.error('[Azure AI] API error:', data.error.message || data.error);
            }
            return [];
        } catch (e) {
            console.error('[Azure AI] Error:', e);
            this._trackResponseTime(performance.now() - start);
            return [];
        }
    }
}
