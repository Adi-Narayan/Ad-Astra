/**
 * Ad Astra — Main Entry Point
 * Connects physics Web Worker ↔ Three.js renderer ↔ UI controls
 */
import { SceneManager } from './renderer/scene.js';

// ============================================================
// State
// ============================================================
let scene = null;
let worker = null;
let playing = true;
let bodies = [];
let simTime = 0;
let selectedIndex = -1;
let fps = 0;
let frameCount = 0;
let lastFpsTime = performance.now();
let presets = [];
let currentSimId = null;

const simSettings = {
    G: 1.0,
    integrator: 'leapfrog',
    timeStep: 0.0001,
    softening: 10,
    theta: 0.5,
    barnesHutThreshold: 1000,
    speed: 1.0,
    stepsPerFrame: 4,
};

// ============================================================
// Initialisation
// ============================================================
async function init() {
    const canvas = document.getElementById('simulatorCanvas');
    scene = new SceneManager(canvas);

    // Start physics worker
    worker = new Worker('/static/js/physics/worker.js');
    worker.onmessage = onWorkerMessage;

    // Load presets
    try {
        const resp = await fetch('/api/presets/');
        presets = await resp.json();
    } catch { presets = []; }

    // Check URL params
    const params = new URLSearchParams(window.location.search);
    const presetId = params.get('preset');
    const loadId = params.get('load');
    const pathParts = window.location.pathname.split('/');
    const shareToken = pathParts.length >= 3 && pathParts[1] === 'simulate' && pathParts[2] ? pathParts[2].replace(/\/$/, '') : null;

    if (loadId) {
        await loadSimulation(loadId);
    } else if (shareToken && shareToken !== '') {
        await loadSharedSimulation(shareToken);
    } else if (presetId) {
        const preset = presets.find(p => p.id == presetId);
        if (preset) {
            loadPreset(preset);
        } else {
            loadDefaultScene();
        }
    } else {
        loadDefaultScene();
    }

    setupUI();
    renderPresetButtons();
    requestAnimationFrame(renderLoop);
}

function loadDefaultScene() {
    // Default: Solar System if presets available, else simple 2-body
    if (presets.length > 0) {
        loadPreset(presets[0]);
    } else {
        const defaultBodies = [
            {
                type: 'star', name: 'Sun', mass: 1000000,
                radius: 20, temperature: 5778,
                position: [0, 0, 0], velocity: [0, 0, 0],
            },
            {
                type: 'planet', name: 'Earth', mass: 3,
                radius: 4, color: '#4169e1',
                position: [150, 0, 0], velocity: [0, 0, 29.78],
            },
        ];
        initSimulation(defaultBodies);
    }
}

function loadPreset(preset) {
    let bodiesList = [...preset.state];

    // Apply settings from preset
    if (preset.settings) {
        Object.assign(simSettings, preset.settings);
        applySettingsToUI();
    }

    // Generate asteroids if needed
    if (preset.settings && preset.settings.generateAsteroids) {
        const count = preset.settings.generateAsteroids;
        const belt = preset.settings.asteroidBelt || { innerRadius: 300, outerRadius: 500, height: 30 };
        const centralMass = bodiesList[0]?.mass || 1000000;

        for (let i = 0; i < count; i++) {
            const r = belt.innerRadius + Math.random() * (belt.outerRadius - belt.innerRadius);
            const angle = Math.random() * Math.PI * 2;
            const y = (Math.random() - 0.5) * belt.height;
            const orbitalV = Math.sqrt(simSettings.G * centralMass / r) * (0.9 + Math.random() * 0.2);

            bodiesList.push({
                type: 'asteroid',
                name: `Asteroid ${i + 1}`,
                mass: 0.001 + Math.random() * 0.01,
                radius: 0.5 + Math.random() * 1.5,
                color: `hsl(${30 + Math.random() * 20}, ${20 + Math.random() * 30}%, ${40 + Math.random() * 30}%)`,
                position: [r * Math.cos(angle), y, r * Math.sin(angle)],
                velocity: [-orbitalV * Math.sin(angle), 0, orbitalV * Math.cos(angle)],
            });
        }
    }

    // Generate cluster if needed
    if (preset.settings && preset.settings.generateCluster) {
        const count = preset.settings.generateCluster;
        const radius = preset.settings.clusterRadius || 600;

        for (let i = 0; i < count; i++) {
            const r = Math.random() * radius;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);
            const temp = 3000 + Math.random() * 25000;

            bodiesList.push({
                type: 'star',
                name: `Star ${i + 1}`,
                mass: 10000 + Math.random() * 200000,
                radius: 3 + Math.random() * 8,
                temperature: temp,
                position: [x, y, z],
                velocity: [(Math.random()-0.5)*5, (Math.random()-0.5)*5, (Math.random()-0.5)*5],
            });
        }
    }

    simSettings.trailLength = preset.settings?.trailLength ?? 500;
    scene.trailLength = simSettings.trailLength;
    initSimulation(bodiesList);
}

function initSimulation(bodiesList) {
    bodies = bodiesList;
    simTime = 0;
    scene.clearTrails();

    worker.postMessage({
        type: 'init',
        bodies: bodiesList,
        settings: simSettings,
    });

    if (playing) {
        worker.postMessage({ type: 'start' });
    }

    updateBodiesList();
    updateStats();
}

// ============================================================
// Worker Messages
// ============================================================
function onWorkerMessage(e) {
    const msg = e.data;
    if (msg.type === 'frame') {
        simTime = msg.time;
        const n = msg.meta.length;

        // Build bodies array for renderer
        const renderBodies = [];
        for (let i = 0; i < n; i++) {
            renderBodies.push({
                type: msg.meta[i].type,
                name: msg.meta[i].name,
                mass: msg.masses[i],
                radius: msg.meta[i].radius,
                color: msg.meta[i].color,
                temperature: msg.meta[i].temperature,
                position: [msg.positions[i*3], msg.positions[i*3+1], msg.positions[i*3+2]],
                velocity: [msg.velocities[i*3], msg.velocities[i*3+1], msg.velocities[i*3+2]],
            });
        }

        bodies = renderBodies;
        scene.syncBodies(renderBodies);
        scene.selectedIndex = selectedIndex;

        // Update stats
        document.getElementById('statBodies').textContent = n;
        document.getElementById('statTime').textContent = simTime.toFixed(2);
        document.getElementById('statEnergy').textContent = msg.energy ? msg.energy.toExponential(2) : 'N/A';
        document.getElementById('statAlgo').textContent = msg.algorithm;
        document.getElementById('timeDisplay').textContent = `t = ${simTime.toFixed(2)}`;

        // Update properties panel if body selected
        if (selectedIndex >= 0 && selectedIndex < n) {
            updatePropsPanel(renderBodies[selectedIndex], selectedIndex);
        }

        // Collision events
        if (msg.collisions) {
            for (const c of msg.collisions) {
                showCollisionNotification(c);
            }
        }

        // Update labels
        updateLabels(renderBodies);

        // FPS counter
        frameCount++;
    }
}

function showCollisionNotification(collision) {
    const note = document.createElement('div');
    note.className = 'collision-notification';
    note.innerHTML = `<strong>Collision!</strong> ${collision.absorbed} absorbed by ${collision.survivor}`;
    document.body.appendChild(note);
    // Trigger animation
    requestAnimationFrame(() => note.classList.add('show'));
    setTimeout(() => {
        note.classList.remove('show');
        setTimeout(() => note.remove(), 400);
    }, 3000);
}

// ============================================================
// Render Loop
// ============================================================
function renderLoop(timestamp) {
    // FPS
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        document.getElementById('statFPS').textContent = fps;
    }

    scene.render(0.016);
    requestAnimationFrame(renderLoop);
}

// ============================================================
// UI Setup
// ============================================================
function setupUI() {
    // Play/Pause
    document.getElementById('btnPlay').addEventListener('click', () => {
        playing = !playing;
        document.getElementById('playIcon').textContent = playing ? '⏸' : '▶';
        document.getElementById('btnPlay').classList.toggle('active', playing);
        worker.postMessage({ type: playing ? 'start' : 'stop' });
    });

    // Step
    document.getElementById('btnStep').addEventListener('click', () => {
        if (!playing) {
            worker.postMessage({ type: 'step' });
        }
    });

    // Reset
    document.getElementById('btnReset').addEventListener('click', () => {
        const params = new URLSearchParams(window.location.search);
        const presetId = params.get('preset');
        if (presetId) {
            const preset = presets.find(p => p.id == presetId);
            if (preset) { loadPreset(preset); return; }
        }
        loadDefaultScene();
    });

    // Speed
    const speedSlider = document.getElementById('speedSlider');
    speedSlider.addEventListener('input', () => {
        simSettings.speed = parseFloat(speedSlider.value);
        document.getElementById('speedLabel').textContent = simSettings.speed.toFixed(1) + 'x';
        worker.postMessage({ type: 'updateSettings', settings: { speed: simSettings.speed } });
    });

    // Trails
    document.getElementById('btnTrails').addEventListener('click', (e) => {
        const on = scene.toggleTrails();
        e.currentTarget.classList.toggle('active', on);
    });

    // Labels
    document.getElementById('btnLabels').addEventListener('click', (e) => {
        scene.showLabels = !scene.showLabels;
        e.currentTarget.classList.toggle('active', scene.showLabels);
        document.querySelectorAll('.body-label').forEach(l => l.style.display = scene.showLabels ? '' : 'none');
    });

    // Grid
    document.getElementById('btnGrid').addEventListener('click', (e) => {
        scene.toggleGrid();
        e.currentTarget.classList.toggle('active', scene.showGrid);
    });

    // Fullscreen
    document.getElementById('btnFullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });

    // Canvas click — pick bodies
    scene.canvas.addEventListener('click', (e) => {
        const idx = scene.pick(e.clientX, e.clientY);
        selectBody(idx);
    });

    // Add body modal
    document.getElementById('btnAddBody').addEventListener('click', () => {
        document.getElementById('addBodyModal').style.display = '';
    });
    document.getElementById('btnCloseModal').addEventListener('click', () => {
        document.getElementById('addBodyModal').style.display = 'none';
    });

    // Body type toggle for temperature vs color fields
    document.getElementById('bodyType').addEventListener('change', (e) => {
        const isStarType = e.target.value === 'star';
        document.getElementById('tempGroup').style.display = isStarType ? '' : 'none';
        document.getElementById('colorGroup').style.display = isStarType ? 'none' : '';
    });

    // Add body form
    document.getElementById('addBodyForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const body = {
            type: document.getElementById('bodyType').value,
            name: document.getElementById('bodyName').value,
            mass: parseFloat(document.getElementById('bodyMass').value),
            radius: parseFloat(document.getElementById('bodyRadius').value),
            position: [
                parseFloat(document.getElementById('bodyPX').value),
                parseFloat(document.getElementById('bodyPY').value),
                parseFloat(document.getElementById('bodyPZ').value),
            ],
            velocity: [
                parseFloat(document.getElementById('bodyVX').value),
                parseFloat(document.getElementById('bodyVY').value),
                parseFloat(document.getElementById('bodyVZ').value),
            ],
        };
        if (body.type === 'star') {
            body.temperature = parseFloat(document.getElementById('bodyTemp').value);
        } else {
            body.color = document.getElementById('bodyColor').value;
        }
        worker.postMessage({ type: 'addBody', body });
        document.getElementById('addBodyModal').style.display = 'none';
    });

    // Close props
    document.getElementById('btnCloseProps').addEventListener('click', () => {
        selectBody(-1);
    });

    // Settings panel
    document.getElementById('btnSettings').addEventListener('click', () => {
        const panel = document.getElementById('panelSettings');
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });
    document.getElementById('btnCloseSettings').addEventListener('click', () => {
        document.getElementById('panelSettings').style.display = 'none';
    });

    // Settings controls
    document.getElementById('settingIntegrator').addEventListener('change', (e) => {
        simSettings.integrator = e.target.value;
        worker.postMessage({ type: 'updateSettings', settings: { integrator: simSettings.integrator } });
    });
    document.getElementById('settingDt').addEventListener('change', (e) => {
        simSettings.timeStep = parseFloat(e.target.value);
        worker.postMessage({ type: 'updateSettings', settings: { timeStep: simSettings.timeStep } });
    });
    document.getElementById('settingTrail').addEventListener('input', (e) => {
        simSettings.trailLength = parseInt(e.target.value);
        scene.trailLength = simSettings.trailLength;
        document.getElementById('trailLabel').textContent = simSettings.trailLength;
    });
    document.getElementById('settingSoftening').addEventListener('change', (e) => {
        simSettings.softening = parseFloat(e.target.value);
        worker.postMessage({ type: 'updateSettings', settings: { softening: simSettings.softening } });
    });
    document.getElementById('settingTheta').addEventListener('change', (e) => {
        simSettings.theta = parseFloat(e.target.value);
        worker.postMessage({ type: 'updateSettings', settings: { theta: simSettings.theta } });
    });
    document.getElementById('settingBloom').addEventListener('change', (e) => {
        scene.bloomEnabled = e.target.checked;
    });
    document.getElementById('settingCollisions').addEventListener('change', (e) => {
        worker.postMessage({ type: 'updateSettings', settings: { collisions: e.target.checked } });
    });

    // Save modal
    document.getElementById('btnSave').addEventListener('click', () => {
        document.getElementById('saveModal').style.display = '';
    });
    document.getElementById('btnCloseSave').addEventListener('click', () => {
        document.getElementById('saveModal').style.display = 'none';
        document.getElementById('saveResult').style.display = 'none';
    });
    document.getElementById('saveForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSimulation();
    });

    // Screenshot
    document.getElementById('btnScreenshot').addEventListener('click', () => {
        const dataUrl = scene.screenshot();
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `ad-astra-${Date.now()}.png`;
        a.click();
    });
}

// ============================================================
// Body Selection & Properties
// ============================================================
function selectBody(index) {
    selectedIndex = index;
    scene.selectedIndex = index;

    const panel = document.getElementById('panelRight');
    if (index >= 0 && index < bodies.length) {
        panel.classList.add('open');
        updatePropsPanel(bodies[index], index);
        scene.focusOn(index);
    } else {
        panel.classList.remove('open');
        selectedIndex = -1;
    }
    updateBodiesList();
}

function updatePropsPanel(body, index) {
    const container = document.getElementById('propsContent');
    document.getElementById('propTitle').textContent = body.name;

    container.innerHTML = `
        <div class="prop-group">
            <label>Name</label>
            <input type="text" value="${body.name}" data-prop="name" data-index="${index}">
        </div>
        <div class="prop-group">
            <label>Type</label>
            <input type="text" value="${body.type}" disabled>
        </div>
        <div class="prop-group">
            <label>Mass</label>
            <input type="number" value="${body.mass}" step="any" data-prop="mass" data-index="${index}">
        </div>
        <div class="prop-group">
            <label>Radius</label>
            <input type="number" value="${body.radius}" step="any" data-prop="radius" data-index="${index}">
        </div>
        <div class="prop-row">
            <div class="prop-group"><label>Pos X</label><input type="number" value="${body.position[0].toFixed(1)}" disabled></div>
            <div class="prop-group"><label>Pos Y</label><input type="number" value="${body.position[1].toFixed(1)}" disabled></div>
            <div class="prop-group"><label>Pos Z</label><input type="number" value="${body.position[2].toFixed(1)}" disabled></div>
        </div>
        <div class="prop-row">
            <div class="prop-group"><label>Vel X</label><input type="number" value="${body.velocity[0].toFixed(2)}" disabled></div>
            <div class="prop-group"><label>Vel Y</label><input type="number" value="${body.velocity[1].toFixed(2)}" disabled></div>
            <div class="prop-group"><label>Vel Z</label><input type="number" value="${body.velocity[2].toFixed(2)}" disabled></div>
        </div>
        <div class="prop-group">
            <label>Speed (km/s)</label>
            <input type="text" value="${Math.sqrt(body.velocity[0]**2 + body.velocity[1]**2 + body.velocity[2]**2).toFixed(2)}" disabled>
        </div>
        ${body.temperature ? `<div class="prop-group">
            <label>Temperature (K)</label>
            <input type="text" value="${body.temperature}" disabled>
        </div>` : ''}
        <button class="btn btn-primary btn-full" style="margin-top:8px" id="btnFocus">Focus Camera</button>
        <button class="btn btn-ghost btn-full" style="margin-top:8px;border-color:var(--danger);color:var(--danger)" id="btnDeleteBody">Remove Body</button>
    `;

    // Editable fields
    container.querySelectorAll('input[data-prop]').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const prop = e.target.dataset.prop;
            const idx = parseInt(e.target.dataset.index);
            const val = prop === 'name' ? e.target.value : parseFloat(e.target.value);
            worker.postMessage({ type: 'updateBody', index: idx, props: { [prop]: val } });
        });
    });

    // Focus button
    document.getElementById('btnFocus')?.addEventListener('click', () => scene.focusOn(index));

    // Delete button
    document.getElementById('btnDeleteBody')?.addEventListener('click', () => {
        worker.postMessage({ type: 'removeBody', index });
        selectBody(-1);
    });
}

// ============================================================
// Bodies List (Left Panel)
// ============================================================
function updateBodiesList() {
    const list = document.getElementById('bodiesList');
    list.innerHTML = '';

    bodies.forEach((b, i) => {
        const item = document.createElement('div');
        item.className = 'body-item' + (i === selectedIndex ? ' selected' : '');
        const dotColor = b.color || (b.type === 'star' ? '#ffcc00' : b.type === 'blackhole' ? '#333' : '#888');
        item.innerHTML = `
            <span class="body-dot" style="background:${dotColor}"></span>
            <span class="body-name">${b.name}</span>
            <span class="body-type">${b.type}</span>
            <button class="body-delete" title="Remove">×</button>
        `;
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('body-delete')) {
                worker.postMessage({ type: 'removeBody', index: i });
                if (selectedIndex === i) selectBody(-1);
                return;
            }
            selectBody(i);
        });
        list.appendChild(item);
    });
}

function updateStats() {
    document.getElementById('statBodies').textContent = bodies.length;
}

// ============================================================
// Labels
// ============================================================
function updateLabels(renderBodies) {
    // Remove old labels
    document.querySelectorAll('.body-label').forEach(l => l.remove());

    if (!scene.showLabels) return;

    // Only show labels for non-asteroid types or if < 50 bodies
    const showAll = renderBodies.length < 50;

    renderBodies.forEach((b, i) => {
        if (!showAll && b.type === 'asteroid') return;

        const sp = scene.getScreenPosition(i);
        if (!sp || !sp.visible) return;

        const label = document.createElement('div');
        label.className = 'body-label';
        label.textContent = b.name;
        label.style.left = sp.x + 'px';
        label.style.top = sp.y + 'px';
        document.body.appendChild(label);
    });
}

// ============================================================
// Preset Buttons
// ============================================================
function renderPresetButtons() {
    const container = document.getElementById('presetButtons');
    container.innerHTML = '';
    presets.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.innerHTML = `<span class="p-icon">${p.thumbnail}</span> ${p.name}`;
        btn.addEventListener('click', () => loadPreset(p));
        container.appendChild(btn);
    });
}

// ============================================================
// Save / Load
// ============================================================
async function saveSimulation() {
    const name = document.getElementById('saveName').value;
    const desc = document.getElementById('saveDesc').value;
    const isPublic = document.getElementById('savePublic').checked;

    const payload = {
        name,
        description: desc,
        state: bodies,
        sim_settings: simSettings,
        is_public: isPublic,
    };

    try {
        const csrfToken = getCookie('csrftoken');
        const method = currentSimId ? 'PUT' : 'POST';
        const url = currentSimId ? `/api/simulations/${currentSimId}/` : '/api/simulations/';

        const resp = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken,
            },
            body: JSON.stringify(payload),
        });

        if (resp.ok) {
            const data = await resp.json();
            currentSimId = data.id;
            const result = document.getElementById('saveResult');
            result.style.display = '';
            let html = 'Saved successfully!';
            if (data.share_url) {
                html += `<br><a href="${data.share_url}" target="_blank">Share link</a>`;
            }
            result.innerHTML = html;
        } else if (resp.status === 403) {
            const result = document.getElementById('saveResult');
            result.style.display = '';
            result.innerHTML = 'Please <a href="/accounts/login/">log in</a> to save simulations.';
        }
    } catch (err) {
        console.error('Save failed:', err);
    }
}

async function loadSimulation(id) {
    try {
        const resp = await fetch(`/api/simulations/${id}/`);
        if (resp.ok) {
            const data = await resp.json();
            currentSimId = data.id;
            if (data.sim_settings) Object.assign(simSettings, data.sim_settings);
            applySettingsToUI();
            initSimulation(data.state || []);
        }
    } catch (err) {
        console.error('Load failed:', err);
        loadDefaultScene();
    }
}

async function loadSharedSimulation(token) {
    try {
        const resp = await fetch(`/api/shared/${token}/`);
        if (resp.ok) {
            const data = await resp.json();
            if (data.sim_settings) Object.assign(simSettings, data.sim_settings);
            applySettingsToUI();
            initSimulation(data.state || []);
        }
    } catch {
        loadDefaultScene();
    }
}

function applySettingsToUI() {
    document.getElementById('settingIntegrator').value = simSettings.integrator;
    document.getElementById('settingDt').value = simSettings.timeStep;
    document.getElementById('settingTrail').value = simSettings.trailLength || 500;
    document.getElementById('trailLabel').textContent = simSettings.trailLength || 500;
    document.getElementById('settingSoftening').value = simSettings.softening;
    document.getElementById('settingTheta').value = simSettings.theta;
}

// ============================================================
// Helpers
// ============================================================
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
}

// ============================================================
// Boot
// ============================================================
document.addEventListener('DOMContentLoaded', init);
