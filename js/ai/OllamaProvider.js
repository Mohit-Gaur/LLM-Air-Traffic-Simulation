// ============================================================================
// OllamaProvider.js — Ollama Local LLM Integration
// ============================================================================

import { LLMAdapter } from './LLMAdapter.js';

export class OllamaProvider extends LLMAdapter {
    constructor(host = 'http://localhost:11434', model = 'llama3.1') {
        super(`Ollama ${model}`, model);
        this.host = host;
        this.model = model;
        this.availableModels = [];
        this._connected = false;
    }

    /**
     * Check connectivity and discover available models on the Ollama server.
     * Returns true if the server is reachable.
     */
    async checkConnection() {
        try {
            const resp = await fetch(`${this.host}/api/tags`, { signal: AbortSignal.timeout(5000) });
            if (resp.ok) {
                const data = await resp.json();
                this.availableModels = (data.models || []).map(m =>
                    typeof m === 'object' ? (m.name || String(m)) : String(m)
                );
                this._connected = true;
                console.log(`[Ollama] Connected. Available models: ${this.availableModels.join(', ') || 'none'}`);

                // If the configured model isn't available, fall back to first available
                if (this.availableModels.length > 0 && !this.availableModels.includes(this.model)) {
                    const fallback = this.availableModels[0];
                    console.warn(`[Ollama] Model '${this.model}' not found, falling back to '${fallback}'`);
                    this.model = fallback;
                    this.modelId = fallback;
                    this.name = `Ollama ${fallback}`;
                }
                return true;
            }
        } catch (e) {
            console.warn(`[Ollama] Cannot connect to ${this.host}: ${e.message}`);
        }
        this._connected = false;
        return false;
    }

    /**
     * Switch to a different Ollama model at runtime.
     */
    switchModel(newModel) {
        this.model = newModel;
        this.modelId = newModel;
        this.name = `Ollama ${newModel}`;
        console.log(`[Ollama] Switched to model: ${newModel}`);
    }

    isConnected() { return this._connected; }
    getAvailableModels() { return [...this.availableModels]; }

    async getDecisions(state) {
        if (!this._connected) return [];
        const start = performance.now();

        try {
            const systemPrompt = this._buildSystemPrompt();
            const userPrompt = this._buildUserPrompt(state);

            const resp = await fetch(`${this.host}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    stream: false,
                    options: {
                        temperature: 0.3,
                        top_p: 0.9,
                        num_predict: 2000
                    }
                }),
                signal: AbortSignal.timeout(30000)
            });

            if (!resp.ok) {
                console.error(`[Ollama] HTTP ${resp.status}: ${resp.statusText}`);
                this._trackResponseTime(performance.now() - start);
                return [];
            }

            const data = await resp.json();
            this._trackResponseTime(performance.now() - start);

            const content = data.message?.content || data.response || '';
            if (content) {
                return this._parseResponse(content);
            }
            return [];
        } catch (e) {
            console.error('[Ollama] Error:', e);
            this._trackResponseTime(performance.now() - start);
            return [];
        }
    }
}
