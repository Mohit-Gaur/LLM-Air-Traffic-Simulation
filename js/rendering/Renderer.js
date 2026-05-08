// ============================================================================
// Renderer.js — Canvas Rendering Engine
// ============================================================================

import { AircraftState } from '../models/Aircraft.js';
import Config from '../utils/Config.js';
import { lerp, distance } from '../utils/helpers.js';

const STATE_COLORS = {
    approaching: '#00e5ff',
    holding_air: '#ffc107',
    landing: '#76ff03',
    landed: '#8bc34a',
    taxiing_to_gate: '#ff9800',
    at_gate: '#9e9e9e',
    taxiing_to_runway: '#ff9800',
    holding_ground: '#ffc107',
    takeoff: '#e040fb',
    departing: '#7c4dff',
    removed: '#444'
};

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.radarAngle = 0;
        this._animFrame = 0;
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.width = w;
        this.height = h;
    }

    draw(engine) {
        const ctx = this.ctx;
        this._animFrame++;
        this.radarAngle += 0.008;

        // Clear
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw layers
        this._drawGrid(ctx);
        this._drawRadarSweep(ctx);
        this._drawAirport(ctx, engine.stateManager);
        this._drawCollisionZones(ctx, engine.collisionSystem);
        this._drawTrails(ctx, engine.stateManager.aircraft);
        this._drawAircraft(ctx, engine.stateManager.aircraft);
        this._drawHUD(ctx, engine);
    }

    _drawGrid(ctx) {
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x < this.width; x += 50) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
        }
        for (let y = 0; y < this.height; y += 50) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
        }
    }

    _drawRadarSweep(ctx) {
        const cx = this.width * 0.55, cy = this.height * 0.5;
        const radius = Math.max(this.width, this.height);
        const gradient = ctx.createConicGradient(this.radarAngle, cx, cy);
        gradient.addColorStop(0, 'rgba(0, 229, 255, 0.06)');
        gradient.addColorStop(0.05, 'rgba(0, 229, 255, 0.02)');
        gradient.addColorStop(0.1, 'rgba(0, 229, 255, 0)');
        gradient.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
    }

    _drawAirport(ctx, stateManager) {
        // Terminal building
        const term = Config.get('airport.terminal', { x: 50, y: 220, width: 120, height: 420 });
        const tg = ctx.createLinearGradient(term.x, term.y, term.x + term.width, term.y);
        tg.addColorStop(0, 'rgba(30, 40, 60, 0.9)');
        tg.addColorStop(1, 'rgba(20, 30, 50, 0.7)');
        ctx.fillStyle = tg;
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
        ctx.lineWidth = 2;
        this._roundRect(ctx, term.x, term.y, term.width, term.height, 8);
        ctx.fill(); ctx.stroke();

        // Terminal label
        ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TERMINAL', term.x + term.width / 2, term.y + 18);

        // Gates
        for (const gate of stateManager.gates) {
            const gx = gate.x, gy = gate.y;
            ctx.fillStyle = gate.occupied ? 'rgba(255, 152, 0, 0.3)' : 'rgba(0, 229, 255, 0.15)';
            ctx.strokeStyle = gate.occupied ? 'rgba(255, 152, 0, 0.6)' : 'rgba(0, 229, 255, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(gx, gy, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

            // Gate connector to terminal
            ctx.strokeStyle = 'rgba(100, 120, 150, 0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(term.x + term.width, gy); ctx.lineTo(gx - 12, gy); ctx.stroke();

            ctx.fillStyle = 'rgba(200, 220, 255, 0.7)';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`G${gate.id}`, gx, gy + 3);
        }

        // Runways
        for (const rw of stateManager.runways) {
            const rx = rw.x, ry = rw.y, rLen = rw.length;

            // Runway strip
            ctx.fillStyle = 'rgba(50, 60, 80, 0.7)';
            ctx.fillRect(rx, ry - 12, rLen, 24);

            // Center line dashes
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([15, 10]);
            ctx.beginPath(); ctx.moveTo(rx + 10, ry); ctx.lineTo(rx + rLen - 10, ry); ctx.stroke();
            ctx.setLineDash([]);

            // Threshold markings
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(rx + 5, ry - 10 + i * 5, 20, 3);
                ctx.fillRect(rx + rLen - 25, ry - 10 + i * 5, 20, 3);
            }

            // Runway border
            ctx.strokeStyle = rw.occupied ? 'rgba(255, 82, 82, 0.6)' : 'rgba(0, 229, 255, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(rx, ry - 12, rLen, 24);

            // Label
            ctx.fillStyle = rw.occupied ? 'rgba(255, 82, 82, 0.9)' : 'rgba(0, 229, 255, 0.8)';
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(rw.label, rx + rLen / 2, ry - 18);

            // Status
            if (rw.occupied) {
                ctx.fillStyle = 'rgba(255, 82, 82, 0.6)';
                ctx.font = '9px Inter, sans-serif';
                ctx.fillText('IN USE', rx + rLen / 2, ry + 30);
            }

            // Taxiway connector from gates to runway
            ctx.strokeStyle = 'rgba(100, 120, 150, 0.2)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(200, ry);
            ctx.lineTo(rx, ry);
            ctx.stroke();
        }

        // Approach corridor indicator
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 10]);
        for (const rw of stateManager.runways) {
            ctx.beginPath();
            ctx.moveTo(rw.x + rw.length, rw.y);
            ctx.lineTo(this.width, rw.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    _drawCollisionZones(ctx, collisionSystem) {
        for (const [, warning] of collisionSystem.activeWarnings) {
            const a = warning.aircraftA;
            const b = warning.aircraftB;
            // We don't have position here, so we skip visual — handled per-aircraft
        }
    }

    _drawTrails(ctx, aircraft) {
        for (const ac of aircraft) {
            if (ac.state === AircraftState.REMOVED || ac.trail.length < 2) continue;
            const color = STATE_COLORS[ac.state] || '#666';

            ctx.beginPath();
            ctx.moveTo(ac.trail[0].x, ac.trail[0].y);
            for (let i = 1; i < ac.trail.length; i++) {
                ctx.lineTo(ac.trail[i].x, ac.trail[i].y);
            }
            ctx.strokeStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba').replace('#', '');
            // Use hex with alpha
            ctx.globalAlpha = 0.2;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    _drawAircraft(ctx, aircraft) {
        for (const ac of aircraft) {
            if (ac.state === AircraftState.REMOVED) continue;
            this._drawSingleAircraft(ctx, ac);
        }
    }

    _drawSingleAircraft(ctx, ac) {
        const x = ac.x, y = ac.y;
        const color = STATE_COLORS[ac.state] || '#666';
        const size = ac.size;

        ctx.save();
        ctx.translate(x, y);

        // Emergency pulse
        if (ac.isEmergency || ac.fuelEmergency) {
            const pulse = Math.sin(this._animFrame * 0.15) * 0.3 + 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, size * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 50, 50, ${pulse * 0.2})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 50, 50, ${pulse * 0.6})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // Collision avoidance indicator
        if (ac.collisionAvoidanceActive) {
            const pulse = Math.sin(this._animFrame * 0.2) * 0.3 + 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 193, 7, ${pulse * 0.5})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Rotate to heading
        ctx.rotate(ac.heading);

        // Draw airplane based on engine type
        const s = size;
        switch (ac.engines) {
            case 'quad-jet':
                this._drawQuadJet(ctx, s, color, ac.blinkOn);
                break;
            case 'turboprop':
                this._drawTurboprop(ctx, s, color, ac.blinkOn, this._animFrame);
                break;
            case 'twin-jet':
            default:
                this._drawTwinJet(ctx, s, color, ac.blinkOn, ac.type);
                break;
        }

        ctx.restore();

        // Fuel bar
        this._drawFuelBar(ctx, ac, x, y, size);

        // Callsign label
        ctx.fillStyle = 'rgba(200, 220, 255, 0.85)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ac.callsign, x, y - size - 14);

        // State tag (small)
        const stateLabel = ac.state.replace(/_/g, ' ').toUpperCase();
        ctx.fillStyle = color + 'aa';
        ctx.font = '8px Inter, sans-serif';
        ctx.fillText(stateLabel, x, y + size + 14);

        // Holding pattern circle indicator
        if (ac.state === AircraftState.HOLDING_AIR && ac.holdingCenter) {
            ctx.beginPath();
            ctx.arc(ac.holdingCenter.x, ac.holdingCenter.y, ac.holdingRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 193, 7, 0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // ── Twin-engine jet (A320, B737, B777) ──────────────────────────────
    _drawTwinJet(ctx, s, color, blinkOn, typeName) {
        const wide = typeName === 'B777'; // wider fuselage for B777
        const fuseW = wide ? s * 0.22 : s * 0.16;
        const fuseLen = s * 1.3;
        const wingSpan = s * 1.1;
        const wingChord = s * 0.45;
        const wingSweep = s * 0.2;
        const tailSpan = s * 0.4;

        // ── Shadow / glow ──
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;

        // ── Fuselage ──
        ctx.beginPath();
        ctx.ellipse(0, 0, fuseLen, fuseW, 0, 0, Math.PI * 2);
        const fuseGrad = ctx.createLinearGradient(-fuseLen, 0, fuseLen, 0);
        fuseGrad.addColorStop(0, color + '55');
        fuseGrad.addColorStop(0.5, color + 'cc');
        fuseGrad.addColorStop(1, color);
        ctx.fillStyle = fuseGrad;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // ── Wings (swept) ──
        ctx.beginPath();
        // Left wing
        ctx.moveTo(s * 0.15, -fuseW);
        ctx.lineTo(-wingSweep, -wingSpan);
        ctx.lineTo(-wingSweep - wingChord, -wingSpan + s * 0.08);
        ctx.lineTo(-s * 0.25, -fuseW);
        ctx.closePath();
        ctx.fillStyle = color + 'aa';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Right wing
        ctx.beginPath();
        ctx.moveTo(s * 0.15, fuseW);
        ctx.lineTo(-wingSweep, wingSpan);
        ctx.lineTo(-wingSweep - wingChord, wingSpan - s * 0.08);
        ctx.lineTo(-s * 0.25, fuseW);
        ctx.closePath();
        ctx.fillStyle = color + 'aa';
        ctx.fill();
        ctx.stroke();

        // ── Horizontal stabilizer (tail wings) ──
        ctx.beginPath();
        ctx.moveTo(-fuseLen * 0.65, -fuseW);
        ctx.lineTo(-fuseLen * 0.9, -tailSpan);
        ctx.lineTo(-fuseLen * 1.0, -tailSpan + s * 0.04);
        ctx.lineTo(-fuseLen * 0.85, -fuseW);
        ctx.closePath();
        ctx.fillStyle = color + '88';
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-fuseLen * 0.65, fuseW);
        ctx.lineTo(-fuseLen * 0.9, tailSpan);
        ctx.lineTo(-fuseLen * 1.0, tailSpan - s * 0.04);
        ctx.lineTo(-fuseLen * 0.85, fuseW);
        ctx.closePath();
        ctx.fillStyle = color + '88';
        ctx.fill();
        ctx.stroke();

        // ── Vertical fin (drawn as line for top-down) ──
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-fuseLen * 0.6, 0);
        ctx.lineTo(-fuseLen * 0.95, 0);
        ctx.stroke();

        // ── Engine nacelles (under wings) ──
        const engY = wingSpan * 0.45;
        const engX = -wingSweep * 0.3;
        const engLen = s * 0.22;
        const engW = s * 0.08;

        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(engX, side * engY, engLen, engW, 0, 0, Math.PI * 2);
            ctx.fillStyle = color + '99';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.7;
            ctx.stroke();
            // Engine intake highlight
            ctx.beginPath();
            ctx.arc(engX + engLen * 0.7, side * engY, engW * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fill();
        }

        // ── Navigation lights (blink) ──
        if (blinkOn) {
            // Red on left wingtip
            ctx.beginPath();
            ctx.arc(-wingSweep - wingChord * 0.5, -wingSpan, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = '#ff1744';
            ctx.fill();
            // Green on right wingtip
            ctx.beginPath();
            ctx.arc(-wingSweep - wingChord * 0.5, wingSpan, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = '#00e676';
            ctx.fill();
        }
        // White nose light (always on)
        ctx.beginPath();
        ctx.arc(fuseLen * 0.9, 0, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        // White tail light (always on)
        ctx.beginPath();
        ctx.arc(-fuseLen * 0.95, 0, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
    }

    // ── Four-engine jet (A380) ──────────────────────────────────────────
    _drawQuadJet(ctx, s, color, blinkOn) {
        const fuseW = s * 0.24;
        const fuseLen = s * 1.4;
        const wingSpan = s * 1.3;
        const wingChord = s * 0.55;
        const wingSweep = s * 0.2;
        const tailSpan = s * 0.45;

        ctx.shadowColor = color;
        ctx.shadowBlur = 8;

        // ── Fuselage (wide body) ──
        ctx.beginPath();
        ctx.ellipse(0, 0, fuseLen, fuseW, 0, 0, Math.PI * 2);
        const fuseGrad = ctx.createLinearGradient(-fuseLen, 0, fuseLen, 0);
        fuseGrad.addColorStop(0, color + '55');
        fuseGrad.addColorStop(0.5, color + 'cc');
        fuseGrad.addColorStop(1, color);
        ctx.fillStyle = fuseGrad;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // ── Wings (large swept) ──
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * 0.2, side * fuseW);
            ctx.lineTo(-wingSweep, side * wingSpan);
            ctx.lineTo(-wingSweep - wingChord, side * (wingSpan - s * 0.1));
            ctx.lineTo(-s * 0.3, side * fuseW);
            ctx.closePath();
            ctx.fillStyle = color + 'aa';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }

        // ── Horizontal stabilizers ──
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-fuseLen * 0.6, side * fuseW);
            ctx.lineTo(-fuseLen * 0.85, side * tailSpan);
            ctx.lineTo(-fuseLen * 0.98, side * (tailSpan - s * 0.05));
            ctx.lineTo(-fuseLen * 0.82, side * fuseW);
            ctx.closePath();
            ctx.fillStyle = color + '88';
            ctx.fill();
            ctx.stroke();
        }

        // ── Vertical fin ──
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-fuseLen * 0.55, 0);
        ctx.lineTo(-fuseLen * 0.95, 0);
        ctx.stroke();

        // ── 4 Engine nacelles ──
        const innerEngY = wingSpan * 0.3;
        const outerEngY = wingSpan * 0.6;
        const innerEngX = -wingSweep * 0.15;
        const outerEngX = -wingSweep * 0.45;
        const engLen = s * 0.2;
        const engW = s * 0.075;

        for (const side of [-1, 1]) {
            // Inner engine
            ctx.beginPath();
            ctx.ellipse(innerEngX, side * innerEngY, engLen, engW, 0, 0, Math.PI * 2);
            ctx.fillStyle = color + '99';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.7;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(innerEngX + engLen * 0.7, side * innerEngY, engW * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fill();

            // Outer engine
            ctx.beginPath();
            ctx.ellipse(outerEngX, side * outerEngY, engLen, engW, 0, 0, Math.PI * 2);
            ctx.fillStyle = color + '99';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.7;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(outerEngX + engLen * 0.7, side * outerEngY, engW * 0.55, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fill();
        }

        // ── Navigation lights ──
        if (blinkOn) {
            ctx.beginPath();
            ctx.arc(-wingSweep - wingChord * 0.5, -wingSpan, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#ff1744';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-wingSweep - wingChord * 0.5, wingSpan, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#00e676';
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(fuseLen * 0.9, 0, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-fuseLen * 0.95, 0, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
    }

    // ── Turboprop (ATR72) ───────────────────────────────────────────────
    _drawTurboprop(ctx, s, color, blinkOn, animFrame) {
        const fuseW = s * 0.14;
        const fuseLen = s * 1.1;
        const wingSpan = s * 1.15;
        const wingChord = s * 0.35;
        const tailSpan = s * 0.38;

        ctx.shadowColor = color;
        ctx.shadowBlur = 5;

        // ── Fuselage (slender) ──
        ctx.beginPath();
        ctx.ellipse(0, 0, fuseLen, fuseW, 0, 0, Math.PI * 2);
        const fuseGrad = ctx.createLinearGradient(-fuseLen, 0, fuseLen, 0);
        fuseGrad.addColorStop(0, color + '55');
        fuseGrad.addColorStop(0.5, color + 'cc');
        fuseGrad.addColorStop(1, color);
        ctx.fillStyle = fuseGrad;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // ── Wings (straighter, less swept — high wing turboprop) ──
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * 0.05, side * fuseW);
            ctx.lineTo(-s * 0.05, side * wingSpan);
            ctx.lineTo(-s * 0.05 - wingChord, side * wingSpan);
            ctx.lineTo(-s * 0.18, side * fuseW);
            ctx.closePath();
            ctx.fillStyle = color + 'aa';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }

        // ── Horizontal stabilizers (T-tail style, wider) ──
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-fuseLen * 0.65, side * fuseW * 0.3);
            ctx.lineTo(-fuseLen * 0.85, side * tailSpan);
            ctx.lineTo(-fuseLen * 0.98, side * (tailSpan - s * 0.04));
            ctx.lineTo(-fuseLen * 0.8, side * fuseW * 0.3);
            ctx.closePath();
            ctx.fillStyle = color + '88';
            ctx.fill();
            ctx.stroke();
        }

        // ── Vertical fin ──
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-fuseLen * 0.55, 0);
        ctx.lineTo(-fuseLen * 0.92, 0);
        ctx.stroke();

        // ── Engine pods + propeller discs ──
        const engY = wingSpan * 0.35;
        const engX = -s * 0.02;
        const engLen = s * 0.14;
        const engW = s * 0.06;
        const propRadius = s * 0.16;

        for (const side of [-1, 1]) {
            // Engine pod
            ctx.beginPath();
            ctx.ellipse(engX, side * engY, engLen, engW, 0, 0, Math.PI * 2);
            ctx.fillStyle = color + 'aa';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.7;
            ctx.stroke();

            // Spinning propeller disc (animated)
            const propAngle = animFrame * 0.4 + (side > 0 ? Math.PI * 0.5 : 0);
            ctx.save();
            ctx.translate(engX + engLen + s * 0.04, side * engY);
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(0, 0, propRadius, 0, Math.PI * 2);
            ctx.fillStyle = color + '44';
            ctx.fill();
            ctx.globalAlpha = 0.7;
            // Blade lines
            for (let b = 0; b < 3; b++) {
                const bAngle = propAngle + (b * Math.PI * 2 / 3);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(bAngle) * propRadius, Math.sin(bAngle) * propRadius);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            // Hub
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.03, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.restore();
        }

        // ── Navigation lights ──
        if (blinkOn) {
            ctx.beginPath();
            ctx.arc(-s * 0.05 - wingChord * 0.5, -wingSpan, 1.6, 0, Math.PI * 2);
            ctx.fillStyle = '#ff1744';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-s * 0.05 - wingChord * 0.5, wingSpan, 1.6, 0, Math.PI * 2);
            ctx.fillStyle = '#00e676';
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(fuseLen * 0.85, 0, 1.3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-fuseLen * 0.92, 0, 1.0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
    }

    _drawFuelBar(ctx, ac, x, y, size) {
        const barW = 24, barH = 3;
        const bx = x - barW / 2, by = y - size - 8;
        const fuelPct = ac.fuel / 100;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

        // Fuel level color
        let fuelColor;
        if (ac.fuelEmergency) fuelColor = '#ff1744';
        else if (ac.fuelLow) fuelColor = '#ffc107';
        else fuelColor = '#00e676';

        ctx.fillStyle = fuelColor;
        ctx.fillRect(bx, by, barW * fuelPct, barH);

        // Percentage text for low/emergency
        if (ac.fuelLow || ac.fuelEmergency) {
            ctx.fillStyle = fuelColor;
            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.round(ac.fuel)}%`, x, by - 3);
        }
    }

    _drawHUD(ctx, engine) {
        // Top-left: Simulation info
        ctx.fillStyle = 'rgba(0, 229, 255, 0.8)';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`FPS: ${engine.fps}`, 10, 20);
        ctx.fillText(`Speed: ${engine.speed}x`, 10, 36);
        ctx.fillText(`Aircraft: ${engine.stateManager.getActiveAircraft().length}`, 10, 52);

        // AI provider indicator
        ctx.fillStyle = 'rgba(118, 255, 3, 0.8)';
        ctx.fillText(`AI: ${engine.currentProvider.getName()}`, 10, 68);

        // Status indicator
        if (engine.paused) {
            ctx.fillStyle = 'rgba(255, 193, 7, 0.9)';
            ctx.font = 'bold 18px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⏸ PAUSED', this.width / 2, 30);
        }

        // Warnings indicator
        const warnings = engine.collisionSystem.getWarnings();
        if (warnings.length > 0) {
            ctx.fillStyle = 'rgba(255, 193, 7, 0.8)';
            ctx.font = 'bold 10px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`⚠ ${warnings.length} proximity warnings`, this.width - 10, 20);
        }

        const crashes = engine.crashAnalyzer.getReportCount();
        if (crashes > 0) {
            ctx.fillStyle = 'rgba(255, 23, 68, 0.9)';
            ctx.fillText(`💥 ${crashes} crash${crashes > 1 ? 'es' : ''}`, this.width - 10, 36);
        }
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
