// ============================================================================
// main.js — Application Bootstrap
// ============================================================================

import Config from './utils/Config.js';
import { SimulationEngine } from './engine/SimulationEngine.js';
import { Renderer } from './rendering/Renderer.js';
import { ControlPanel } from './ui/ControlPanel.js';

async function init() {
    // Load configuration
    await Config.load('config.yaml');
    console.log('[Main] Configuration loaded');

    // Setup canvas
    const canvas = document.getElementById('simulation-canvas');
    const simArea = document.getElementById('simulation-area');

    function resizeCanvas() {
        canvas.width = simArea.clientWidth;
        canvas.height = simArea.clientHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Create engine
    const engine = new SimulationEngine();
    console.log('[Main] Simulation engine created');

    // Create renderer
    const renderer = new Renderer(canvas);
    engine.renderer = renderer;

    // Sync renderer size with canvas resize
    const origResize = resizeCanvas;
    window.addEventListener('resize', () => {
        renderer.resize(canvas.width, canvas.height);
    });

    // Create control panel
    const controlPanel = new ControlPanel(engine);
    engine.controlPanel = controlPanel;

    // Restore saved API keys and setup providers
    ['openai', 'anthropic', 'gemini'].forEach(provider => {
        const key = localStorage.getItem(`apikey_${provider}`);
        if (key) {
            engine.setupLLMProvider(provider, key);
            console.log(`[Main] Restored ${provider} API key`);
        }
    });

    // Restore Azure AI Foundry config
    const azureKey = localStorage.getItem('apikey_azure-ai');
    const azureEndpoint = localStorage.getItem('azure_ai_endpoint');
    if (azureKey && azureEndpoint) {
        const azureDeployment = localStorage.getItem('azure_ai_deployment') || 'gpt-4o';
        engine.setupLLMProvider('azure-ai', azureKey, azureDeployment, azureEndpoint);
        console.log('[Main] Restored Azure AI Foundry config');
    }

    // Auto-start the simulation
    engine.start();
    console.log('[Main] Simulation started');

    // Make engine available for debugging
    window._engine = engine;
}

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
