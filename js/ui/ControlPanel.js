// ============================================================================
// ControlPanel.js — UI Controls & Dashboard
// ============================================================================

import { formatTime } from '../utils/helpers.js';

export class ControlPanel {
    constructor(engine) {
        this.engine = engine;
        this._updateInterval = null;
        this._activeTab = 'controls';
        this._init();
    }

    _init() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                document.getElementById(`tab-${tab}`).classList.add('active');
                this._activeTab = tab;
            });
        });

        // Play/Pause
        document.getElementById('btn-play').addEventListener('click', () => {
            if (!this.engine.running) this.engine.start();
            else this.engine.togglePause();
            this._updatePlayButton();
        });

        // Reset
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.engine.reset();
            this._updatePlayButton();
            this._clearDecisionLog();
            this._clearCrashReports();
        });

        // Speed buttons
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = parseFloat(btn.dataset.speed);
                this.engine.setSpeed(speed);
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // AI Provider selector
        document.getElementById('ai-provider').addEventListener('change', (e) => {
            const key = e.target.value;

            // Hide all provider-specific config sections first
            const ollamaSection = document.getElementById('ollama-config-section');
            const azureSection = document.getElementById('azure-ai-config-section');
            const apiSection = document.getElementById('api-key-section');
            if (ollamaSection) ollamaSection.style.display = 'none';
            if (azureSection) azureSection.style.display = 'none';
            if (apiSection) apiSection.style.display = 'none';

            if (key === 'ollama') {
                if (ollamaSection) ollamaSection.style.display = 'block';
                this._connectOllama();
                return;
            }
            if (key === 'azure-ai') {
                if (azureSection) azureSection.style.display = 'block';
                // Restore saved values
                const savedEndpoint = localStorage.getItem('azure_ai_endpoint') || '';
                const savedKey = localStorage.getItem('apikey_azure-ai') || '';
                const savedDeployment = localStorage.getItem('azure_ai_deployment') || '';
                const endpointInput = document.getElementById('azure-ai-endpoint');
                const keyInput = document.getElementById('azure-ai-key');
                const deployInput = document.getElementById('azure-ai-deployment');
                if (endpointInput && savedEndpoint) endpointInput.value = savedEndpoint;
                if (keyInput && savedKey) keyInput.value = savedKey;
                if (deployInput && savedDeployment) deployInput.value = savedDeployment;
                return;
            }

            if (key === 'openai' || key === 'anthropic' || key === 'gemini') {
                const apiKey = localStorage.getItem(`apikey_${key}`) || '';
                if (!apiKey) {
                    document.getElementById('api-key-section').style.display = 'block';
                    document.getElementById('api-key-input').dataset.provider = key;
                    return;
                }
                this.engine.setupLLMProvider(key, apiKey);
            }
            this.engine.setProvider(key);
        });

        // API key save
        document.getElementById('btn-save-key').addEventListener('click', () => {
            const key = document.getElementById('api-key-input').value.trim();
            const provider = document.getElementById('api-key-input').dataset.provider;
            if (key && provider) {
                localStorage.setItem(`apikey_${provider}`, key);
                this.engine.setupLLMProvider(provider, key);
                this.engine.setProvider(provider);
                document.getElementById('api-key-section').style.display = 'none';
                document.getElementById('api-key-input').value = '';
            }
        });

        // Spawn toggle
        document.getElementById('btn-toggle-spawn').addEventListener('click', () => {
            const enabled = !this.engine.scheduler.spawnEnabled;
            this.engine.scheduler.setSpawnEnabled(enabled);
            document.getElementById('btn-toggle-spawn').textContent = enabled ? '✈ Spawning ON' : '✈ Spawning OFF';
            document.getElementById('btn-toggle-spawn').classList.toggle('off', !enabled);
        });

        // Export logs
        document.getElementById('btn-export').addEventListener('click', () => {
            const data = this.engine.logger.exportJSON();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `atc-log-${Date.now()}.json`; a.click();
            URL.revokeObjectURL(url);
        });

        // Listen for engine events
        this.engine.logger.on('decision', (d) => this._addDecisionEntry(d));
        this.engine.logger.on('event', (e) => this._addEventEntry(e));
        this.engine.crashAnalyzer.on('crash_report', (r) => this._addCrashReport(r));

        // Setup Ollama connect button
        const ollamaBtn = document.getElementById('btn-connect-ollama');
        if (ollamaBtn) ollamaBtn.addEventListener('click', () => this._connectOllama());

        // Setup Azure AI Foundry connect button
        const azureBtn = document.getElementById('btn-connect-azure-ai');
        if (azureBtn) azureBtn.addEventListener('click', () => this._connectAzureAI());

        // Keep button in sync with engine state changes
        this.engine.on('started', () => this._updatePlayButton());
        this.engine.on('paused', () => this._updatePlayButton());
        this.engine.on('resumed', () => this._updatePlayButton());
        this.engine.on('reset', () => this._updatePlayButton());
    }

    _connectAzureAI() {
        const endpoint = document.getElementById('azure-ai-endpoint')?.value?.trim();
        const apiKey = document.getElementById('azure-ai-key')?.value?.trim();
        const deployment = document.getElementById('azure-ai-deployment')?.value?.trim() || 'gpt-4o';
        const statusEl = document.getElementById('azure-ai-status');

        if (!endpoint || !apiKey) {
            if (statusEl) statusEl.textContent = '⚠️ Endpoint and API key are required';
            return;
        }

        // Persist config
        localStorage.setItem('azure_ai_endpoint', endpoint);
        localStorage.setItem('apikey_azure-ai', apiKey);
        localStorage.setItem('azure_ai_deployment', deployment);

        // Setup provider
        this.engine.setupLLMProvider('azure-ai', apiKey, deployment, endpoint);
        this.engine.setProvider('azure-ai');

        if (statusEl) statusEl.textContent = `✅ Connected — ${deployment}`;
    }

    async _connectOllama() {
        const hostInput = document.getElementById('ollama-host');
        const host = hostInput?.value?.trim() || 'http://localhost:11434';
        const statusEl = document.getElementById('ollama-status');
        const modelSelect = document.getElementById('ollama-model-select');

        if (statusEl) statusEl.textContent = 'Connecting...';

        // Create or get provider
        const provider = this.engine.setupLLMProvider('ollama', host);
        if (!provider) return;

        const connected = await provider.checkConnection();
        if (connected) {
            if (statusEl) statusEl.textContent = `✅ Connected`;
            // Populate model dropdown
            if (modelSelect) {
                const models = provider.getAvailableModels();
                modelSelect.innerHTML = models.map(m =>
                    `<option value="${m}"${m === provider.model ? ' selected' : ''}>${m}</option>`
                ).join('');
                modelSelect.style.display = models.length > 0 ? 'block' : 'none';
                modelSelect.onchange = () => {
                    provider.switchModel(modelSelect.value);
                };
            }
            this.engine.setProvider('ollama');
        } else {
            if (statusEl) statusEl.textContent = '❌ Cannot connect';
        }
    }

    _updatePlayButton() {
        const btn = document.getElementById('btn-play');
        if (!this.engine.running) { btn.textContent = '▶ Start'; btn.className = 'control-btn primary'; }
        else if (this.engine.paused) { btn.textContent = '▶ Resume'; btn.className = 'control-btn primary'; }
        else { btn.textContent = '⏸ Pause'; btn.className = 'control-btn warning'; }
    }

    update(engine) {
        // Only update visible tab to save DOM thrash
        this._updateMetrics(engine);
        this._updateAircraftList(engine);
    }

    _updateMetrics(engine) {
        const m = engine.perfTracker.getMetrics();
        const el = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };

        el('metric-elapsed', `${m.elapsed.toFixed(1)} min`);
        el('metric-landings', m.landings);
        el('metric-departures', m.departures);
        el('metric-throughput', `${m.throughput}/min`);
        el('metric-crashes', m.crashes);
        el('metric-go-arounds', m.goArounds);
        el('metric-fuel-emergencies', m.fuelEmergencies);
        el('metric-near-misses', m.nearMisses);
        el('metric-safety', `${m.safetyScore}%`);
        el('metric-avg-fuel', `${m.avgFuelAtLanding}%`);
        el('metric-avg-landing-time', formatTime(m.avgLandingTime));
        el('metric-provider', engine.currentProvider.getName());

        // Quick metrics on Controls tab
        el('quick-throughput', `${m.throughput}/min`);
        el('quick-safety', `${m.safetyScore}%`);

        // Safety score color
        for (const elId of ['metric-safety', 'quick-safety']) {
            const safetyEl = document.getElementById(elId);
            if (safetyEl) {
                if (m.safetyScore >= 90) safetyEl.style.color = '#00e676';
                else if (m.safetyScore >= 70) safetyEl.style.color = '#ffc107';
                else safetyEl.style.color = '#ff1744';
            }
        }

        // Mini throughput chart
        this._drawMiniChart(engine);
    }

    _drawMiniChart(engine) {
        const canvas = document.getElementById('throughput-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const history = engine.perfTracker.getHistory();
        const w = canvas.width, h = canvas.height;

        ctx.fillStyle = 'rgba(10, 14, 26, 0.8)';
        ctx.fillRect(0, 0, w, h);

        if (history.length < 2) return;

        const maxTP = Math.max(...history.map(h => h.throughput), 1);
        ctx.beginPath();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < history.length; i++) {
            const x = (i / (history.length - 1)) * w;
            const y = h - (history[i].throughput / maxTP) * (h - 10) - 5;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    _updateAircraftList(engine) {
        const list = document.getElementById('aircraft-list');
        if (!list || this._activeTab !== 'aircraft') return;

        const aircraft = engine.stateManager.aircraft;
        let html = '';
        for (const ac of aircraft) {
            const fuelClass = ac.fuelEmergency ? 'critical' : ac.fuelLow ? 'low' : 'normal';
            const boardingBar = ac.state === 'boarding'
                ? `<div class="boarding-bar"><div class="boarding-fill" style="width:${Math.round((ac.boardingProgress || 0) * 100)}%"></div></div>`
                : '';
            html += `<div class="aircraft-entry ${fuelClass}">
                <div class="ac-header">
                    <span class="ac-callsign">${ac.callsign}</span>
                    <span class="ac-type">${ac.type}</span>
                </div>
                <div class="ac-details">
                    <span class="ac-state" style="color:${this._getStateColor(ac.state)}">${ac.state.replace(/_/g, ' ')}</span>
                    <span class="ac-fuel fuel-${fuelClass}">⛽ ${Math.round(ac.fuel)}%</span>
                </div>
                <div class="ac-meta">
                    <span class="ac-pax">👤 ${ac.passengerCount || '?'}</span>
                    <span class="ac-route">${ac.origin || '?'} → ${ac.destination || '?'}</span>
                </div>
                ${boardingBar}
            </div>`;
        }
        list.innerHTML = html || '<div class="empty-state">No aircraft active</div>';
    }

    _getStateColor(state) {
        const colors = {
            approaching: '#00e5ff', holding_air: '#ffc107', landing: '#76ff03',
            go_around: '#ff6d00', landed: '#8bc34a', taxiing_to_gate: '#ff9800',
            boarding: '#f48fb1', at_gate: '#9e9e9e',
            taxiing_to_runway: '#ff9800', holding_ground: '#ffc107',
            takeoff: '#e040fb', departing: '#7c4dff'
        };
        return colors[state] || '#666';
    }

    _addDecisionEntry(d) {
        const log = document.getElementById('decision-log');
        if (!log) return;
        const severityClass = d.action.includes('EMERGENCY') || d.action === 'GO_AROUND' ? 'critical' :
            d.action === 'HOLD' ? 'warning' : 'info';
        const entry = document.createElement('div');
        entry.className = `log-entry ${severityClass}`;
        entry.innerHTML = `<span class="log-time">${d.timeStr}</span>
            <span class="log-provider">[${d.provider}]</span>
            <span class="log-action">${d.action}</span>
            <span class="log-detail">${d.reasoning}</span>
            <span class="log-response-time">${d.responseTime}ms</span>`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
        // Trim old entries
        while (log.children.length > 200) log.removeChild(log.firstChild);
    }

    _addEventEntry(e) {
        const log = document.getElementById('decision-log');
        if (!log) return;
        const entry = document.createElement('div');
        entry.className = `log-entry event-${e.severity}`;
        entry.innerHTML = `<span class="log-time">${e.timeStr}</span>
            <span class="log-type">[${e.type}]</span>
            <span class="log-detail">${JSON.stringify(e.data).substring(0, 100)}</span>`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    _addCrashReport(report) {
        const container = document.getElementById('crash-reports');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'crash-report';
        el.innerHTML = `<div class="crash-header">💥 Crash #${report.id + 1} — ${report.timeStr}</div>
            <div class="crash-aircraft">${report.aircraftA.callsign} ↔ ${report.aircraftB.callsign}</div>
            <div class="crash-factors"><strong>Contributing Factors:</strong>
                <ul>${report.contributingFactors.map(f => `<li>${f}</li>`).join('')}</ul>
            </div>
            <div class="crash-rec"><strong>Recommendation:</strong> ${report.recommendation}</div>`;
        container.appendChild(el);
        // Update crash tab badge
        const badge = document.getElementById('crash-badge');
        if (badge) { badge.textContent = this.engine.crashAnalyzer.getReportCount(); badge.style.display = 'inline'; }
    }

    _clearDecisionLog() {
        const log = document.getElementById('decision-log');
        if (log) log.innerHTML = '';
    }

    _clearCrashReports() {
        const container = document.getElementById('crash-reports');
        if (container) container.innerHTML = '';
        const badge = document.getElementById('crash-badge');
        if (badge) badge.style.display = 'none';
    }
}
