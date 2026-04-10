/**
 * Ad Astra — Three.js Scene Manager
 * Handles scene setup, camera, controls, post-processing, textures, and body meshes.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
    starVertexShader, starFragmentShader,
    planetVertexShader, planetFragmentShader,
    blackHoleVertexShader, blackHoleFragmentShader,
    accretionVertexShader, accretionFragmentShader,
    atmosphereVertexShader, atmosphereFragmentShader,
} from './shaders.js';

// Texture lookup by body name
const TEXTURE_PATHS = {
    'Sun': '/static/textures/sun.jpg',
    'Mercury': '/static/textures/mercury.jpg',
    'Venus': '/static/textures/venus.jpg',
    'Earth': '/static/textures/earth.jpg',
    'Moon': '/static/textures/moon.jpg',
    'Mars': '/static/textures/mars.jpg',
    'Jupiter': '/static/textures/jupiter.jpg',
    'Saturn': '/static/textures/saturn.jpg',
    'Uranus': '/static/textures/uranus.jpg',
    'Neptune': '/static/textures/neptune.jpg',
    'Pluto': '/static/textures/pluto.jpg',
    'Ceres': '/static/textures/ceres.jpg',
    '_saturn_ring': '/static/textures/saturn_ring.png',
};

const ATMOSPHERE_CONFIG = {
    'Earth':   { color: '#4488ff', scale: 1.08 },
    'Venus':   { color: '#ffcc66', scale: 1.12 },
    'Jupiter': { color: '#aa8866', scale: 1.05 },
    'Saturn':  { color: '#ccbb88', scale: 1.06 },
    'Uranus':  { color: '#88ccdd', scale: 1.06 },
    'Neptune': { color: '#4466cc', scale: 1.06 },
};

const RING_CONFIG = {
    'Saturn': { inner: 1.4, outer: 2.4, color: '#c8b080', opacity: 0.7, tiltDeg: 26.7 },
    'Uranus': { inner: 1.6, outer: 2.0, color: '#88aacc', opacity: 0.4, tiltDeg: 97.8 },
};

export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.bodyMeshes = [];
        this.trailLines = [];
        this.trailPositions = [];
        this.showTrails = true;
        this.showLabels = true;
        this.showGrid = false;
        this.bloomEnabled = true;
        this.selectedIndex = -1;
        this.time = 0;
        this.trailLength = 500;

        this.textureLoader = new THREE.TextureLoader();
        this.textureCache = {};

        this._initRenderer();
        this._initScene();
        this._initCamera();
        this._initControls();
        this._initPostProcessing();
        this._initLights();
        this._initGrid();

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    /* ── Initialisation ─────────────────────────────────────── */

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.4;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000005);

        // Milky Way panorama as skybox
        this.textureLoader.load('/static/textures/milkyway.jpg', (tex) => {
            tex.mapping = THREE.EquirectangularReflectionMapping;
            tex.colorSpace = THREE.SRGBColorSpace;
            this.scene.background = tex;
        }, undefined, () => {
            // Fallback: procedural starfield
            this._addStarfield();
        });
    }

    _addStarfield() {
        const count = 10000;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const r = 5000 + Math.random() * 5000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffffff, size: 1.2, sizeAttenuation: false,
            transparent: true, opacity: 0.6,
        });
        this.scene.add(new THREE.Points(geo, mat));
    }

    _initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            60, window.innerWidth / window.innerHeight, 0.1, 20000
        );
        this.camera.position.set(0, 200, 400);
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 12000;
        this.controls.enablePan = true;
        this.controls.panSpeed = 1.5;
    }

    _initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.0, 0.4, 0.85
        );
        this.composer.addPass(this.bloomPass);
    }

    _initLights() {
        // Ambient fill so dark-side planets aren't pure black
        this.ambientLight = new THREE.AmbientLight(0x334466, 0.6);
        this.scene.add(this.ambientLight);

        // Hemisphere light for subtle sky/ground color variation
        this.hemiLight = new THREE.HemisphereLight(0x4466aa, 0x222244, 0.3);
        this.scene.add(this.hemiLight);

        this.starLights = [];
    }

    _initGrid() {
        this.gridHelper = new THREE.GridHelper(4000, 80, 0x222244, 0x111122);
        this.gridHelper.visible = false;
        this.scene.add(this.gridHelper);
    }

    _onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        this.bloomPass.resolution.set(w, h);
    }

    /* ── Textures ───────────────────────────────────────────── */

    _getTexture(key) {
        if (this.textureCache[key] !== undefined) return this.textureCache[key];
        const path = TEXTURE_PATHS[key];
        if (!path) { this.textureCache[key] = null; return null; }

        const tex = this.textureLoader.load(
            path,
            (t) => { t.colorSpace = THREE.SRGBColorSpace; },
            undefined,
            () => { this.textureCache[key] = null; }
        );
        tex.colorSpace = THREE.SRGBColorSpace;
        try { tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); } catch {}
        this.textureCache[key] = tex;
        return tex;
    }

    /* ── Star Lights ────────────────────────────────────────── */

    _updateStarLights(bodies) {
        for (const l of this.starLights) this.scene.remove(l);
        this.starLights = [];

        for (const b of bodies) {
            if (b.type === 'star') {
                // Physical intensity (candela) — needs to be large to reach distant planets
                // At distance d, received light = intensity / d².  Neptune is ~4500 units away.
                const intensity = Math.min(800000, (b.mass || 100000) * 0.5);
                const light = new THREE.PointLight(0xffffff, intensity, 0, 1.6);
                light.position.set(b.position[0], b.position[1], b.position[2]);
                this.scene.add(light);
                this.starLights.push(light);
            }
        }
        if (this.starLights.length === 0) {
            const light = new THREE.PointLight(0xffffff, 50000, 0, 1.6);
            this.scene.add(light);
            this.starLights.push(light);
        }
    }

    /* ── Sync Loop ──────────────────────────────────────────── */

    syncBodies(bodies) {
        // Remove excess meshes
        while (this.bodyMeshes.length > bodies.length) {
            const mesh = this.bodyMeshes.pop();
            this._disposeExtras(mesh);
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material.dispose) mesh.material.dispose();

            const trail = this.trailLines.pop();
            if (trail) { this.scene.remove(trail); trail.geometry.dispose(); trail.material.dispose(); }
            this.trailPositions.pop();
        }

        this._updateStarLights(bodies);

        for (let i = 0; i < bodies.length; i++) {
            const b = bodies[i];
            let mesh = this.bodyMeshes[i];

            if (!mesh) {
                mesh = this._createBodyMesh(b);
                this.bodyMeshes[i] = mesh;
                this.scene.add(mesh);

                this.trailPositions[i] = [];
                const trailMat = new THREE.LineBasicMaterial({
                    color: this._getBodyColor(b), transparent: true, opacity: 0.4,
                });
                const trailLine = new THREE.Line(new THREE.BufferGeometry(), trailMat);
                this.trailLines[i] = trailLine;
                this.scene.add(trailLine);
            }

            // Position
            mesh.position.set(b.position[0], b.position[1], b.position[2]);

            // Shader uniforms
            if (mesh.material.uniforms && mesh.material.uniforms.time) {
                mesh.material.uniforms.time.value = this.time;
            }

            // Extras (atmosphere, rings, accretion disc)
            if (mesh.userData.extras) {
                for (const extra of mesh.userData.extras) {
                    extra.position.copy(mesh.position);
                    if (extra.material.uniforms && extra.material.uniforms.time) {
                        extra.material.uniforms.time.value = this.time;
                    }
                }
            }

            // Slow rotation for textured bodies
            if (mesh.userData.textured) {
                mesh.rotation.y += 0.002;
            }

            // Selection highlight
            mesh.scale.setScalar(i === this.selectedIndex ? 1.12 : 1.0);

            // Trail
            if (this.showTrails && this.trailLength > 0) {
                const tp = this.trailPositions[i];
                tp.push(b.position[0], b.position[1], b.position[2]);
                while (tp.length > this.trailLength * 3) { tp.shift(); tp.shift(); tp.shift(); }
                const trailLine = this.trailLines[i];
                if (tp.length >= 6) {
                    const arr = new Float32Array(tp);
                    trailLine.geometry.dispose();
                    trailLine.geometry = new THREE.BufferGeometry();
                    trailLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
                }
                trailLine.visible = true;
            } else if (this.trailLines[i]) {
                this.trailLines[i].visible = false;
            }
        }
    }

    /* ── Mesh Creation ──────────────────────────────────────── */

    _createBodyMesh(body) {
        const isSmall = body.type === 'asteroid';
        const segments = isSmall ? 16 : 64;
        const geo = new THREE.SphereGeometry(body.radius || 5, segments, segments);
        let mat;
        const extras = [];
        let textured = false;

        const texture = this._getTexture(body.name);

        switch (body.type) {
            case 'star': {
                if (texture) {
                    mat = new THREE.MeshBasicMaterial({ map: texture });
                    textured = true;
                } else {
                    mat = new THREE.ShaderMaterial({
                        vertexShader: starVertexShader,
                        fragmentShader: starFragmentShader,
                        uniforms: {
                            time: { value: 0 },
                            temperature: { value: body.temperature || 5778 },
                            radius: { value: body.radius || 10 },
                        },
                    });
                }
                break;
            }

            case 'blackhole': {
                mat = new THREE.ShaderMaterial({
                    vertexShader: blackHoleVertexShader,
                    fragmentShader: blackHoleFragmentShader,
                    uniforms: { time: { value: 0 } },
                    transparent: true,
                });
                const discGeo = new THREE.RingGeometry(
                    (body.radius || 20) * 1.5, (body.radius || 20) * 4, 64
                );
                const discMat = new THREE.ShaderMaterial({
                    vertexShader: accretionVertexShader,
                    fragmentShader: accretionFragmentShader,
                    uniforms: { time: { value: 0 } },
                    transparent: true, side: THREE.DoubleSide,
                });
                const disc = new THREE.Mesh(discGeo, discMat);
                disc.rotation.x = -Math.PI / 2;
                this.scene.add(disc);
                extras.push(disc);
                break;
            }

            case 'planet':
            case 'moon':
            case 'dwarf': {
                if (texture) {
                    mat = new THREE.MeshStandardMaterial({
                        map: texture, roughness: 0.85, metalness: 0.05,
                        emissive: 0xffffff, emissiveIntensity: 0.04, emissiveMap: texture,
                    });
                    textured = true;
                } else {
                    const color = new THREE.Color(body.color || '#4169e1');
                    mat = new THREE.ShaderMaterial({
                        vertexShader: planetVertexShader,
                        fragmentShader: planetFragmentShader,
                        uniforms: {
                            baseColor: { value: color },
                            time: { value: 0 },
                        },
                    });
                }

                // Atmosphere glow
                const atmo = ATMOSPHERE_CONFIG[body.name];
                if (atmo) {
                    const atmoGeo = new THREE.SphereGeometry(
                        (body.radius || 5) * atmo.scale, 48, 48
                    );
                    const atmoMat = new THREE.ShaderMaterial({
                        vertexShader: atmosphereVertexShader,
                        fragmentShader: atmosphereFragmentShader,
                        uniforms: { glowColor: { value: new THREE.Color(atmo.color) } },
                        transparent: true,
                        side: THREE.FrontSide,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                    });
                    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
                    this.scene.add(atmoMesh);
                    extras.push(atmoMesh);
                }

                // Planetary rings
                const rc = RING_CONFIG[body.name];
                if (rc) {
                    const r = body.radius || 5;
                    const ringGeo = new THREE.RingGeometry(r * rc.inner, r * rc.outer, 128);
                    const ringTex = this._getTexture('_saturn_ring');
                    const ringMat = ringTex
                        ? new THREE.MeshBasicMaterial({
                            map: ringTex, side: THREE.DoubleSide,
                            transparent: true, opacity: rc.opacity,
                        })
                        : new THREE.MeshBasicMaterial({
                            color: rc.color, side: THREE.DoubleSide,
                            transparent: true, opacity: rc.opacity,
                        });
                    const ring = new THREE.Mesh(ringGeo, ringMat);
                    ring.rotation.x = -Math.PI / 2 + (rc.tiltDeg * Math.PI) / 180;
                    this.scene.add(ring);
                    extras.push(ring);
                }
                break;
            }

            case 'asteroid': {
                const color = new THREE.Color(body.color || '#888888');
                mat = new THREE.MeshStandardMaterial({
                    color, roughness: 0.9, metalness: 0.15,
                    emissive: color, emissiveIntensity: 0.08,
                });
                break;
            }

            default: {
                mat = new THREE.MeshStandardMaterial({
                    color: body.color || '#888888',
                    roughness: 0.85, metalness: 0.1,
                    emissive: new THREE.Color(body.color || '#888888'),
                    emissiveIntensity: 0.05,
                });
                break;
            }
        }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { bodyType: body.type, bodyName: body.name, extras, textured };
        return mesh;
    }

    _disposeExtras(mesh) {
        if (!mesh.userData.extras) return;
        for (const ex of mesh.userData.extras) {
            this.scene.remove(ex);
            ex.geometry.dispose();
            if (ex.material.dispose) ex.material.dispose();
        }
    }

    _getBodyColor(body) {
        if (body.color) return new THREE.Color(body.color);
        if (body.type === 'star') {
            const t = (body.temperature || 5778) / 100;
            const r = t <= 66 ? 1 : Math.min(1, 1.29 * Math.pow(t - 60, -0.133));
            const g = t <= 66 ? Math.min(1, 0.39 * Math.log(t) - 0.63)
                               : Math.min(1, 1.13 * Math.pow(t - 60, -0.076));
            const b2 = t >= 66 ? 1 : t <= 19 ? 0
                               : Math.min(1, 0.54 * Math.log(t - 10) - 1.2);
            return new THREE.Color(r, g, b2);
        }
        return new THREE.Color(0x888888);
    }

    /* ── Interaction ─────────────────────────────────────────── */

    pick(screenX, screenY) {
        this.mouse.x = (screenX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(screenY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.bodyMeshes);
        return intersects.length > 0 ? this.bodyMeshes.indexOf(intersects[0].object) : -1;
    }

    focusOn(index) {
        if (index >= 0 && index < this.bodyMeshes.length) {
            this.controls.target.copy(this.bodyMeshes[index].position);
        }
    }

    /* ── Render ──────────────────────────────────────────────── */

    render(dt) {
        this.time += dt;
        this.controls.update();
        this.gridHelper.visible = this.showGrid;
        this.bloomPass.enabled = this.bloomEnabled;
        if (this.bloomEnabled) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    getScreenPosition(index) {
        if (index < 0 || index >= this.bodyMeshes.length) return null;
        const pos = this.bodyMeshes[index].position.clone();
        pos.project(this.camera);
        return {
            x: (pos.x * 0.5 + 0.5) * window.innerWidth,
            y: (-pos.y * 0.5 + 0.5) * window.innerHeight,
            visible: pos.z < 1,
        };
    }

    screenshot() {
        this.renderer.render(this.scene, this.camera);
        return this.canvas.toDataURL('image/png');
    }

    toggleTrails() {
        this.showTrails = !this.showTrails;
        if (!this.showTrails) this.trailPositions = this.trailPositions.map(() => []);
        return this.showTrails;
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
        return this.showGrid;
    }

    clearTrails() {
        this.trailPositions = this.trailPositions.map(() => []);
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.controls.dispose();
        this.renderer.dispose();
    }
}
