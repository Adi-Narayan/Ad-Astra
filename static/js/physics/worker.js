/**
 * Ad Astra — Physics Web Worker
 * Runs the N-body simulation off the main thread so rendering never blocks.
 *
 * Communication protocol:
 *   Main → Worker:
 *     { type: 'init', bodies, settings }
 *     { type: 'start' }
 *     { type: 'stop' }
 *     { type: 'step' }
 *     { type: 'updateSettings', settings }
 *     { type: 'addBody', body }
 *     { type: 'removeBody', index }
 *     { type: 'updateBody', index, props }
 *
 *   Worker → Main:
 *     { type: 'frame', positions, velocities, time, energy, algorithm }
 */

// ---- Inline physics (workers can't use ES modules in all browsers) ----

// Direct O(n²) acceleration
function computeAccDirect(positions, masses, G, softening) {
    const n = masses.length;
    const acc = new Float64Array(n * 3);
    const eps2 = softening * softening;

    for (let i = 0; i < n; i++) {
        const ix = i * 3;
        let ax = 0, ay = 0, az = 0;
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const jx = j * 3;
            const dx = positions[jx] - positions[ix];
            const dy = positions[jx+1] - positions[ix+1];
            const dz = positions[jx+2] - positions[ix+2];
            const r2 = dx*dx + dy*dy + dz*dz + eps2;
            const r = Math.sqrt(r2);
            const f = G * masses[j] / (r2 * r);
            ax += f * dx;
            ay += f * dy;
            az += f * dz;
        }
        acc[ix] = ax;
        acc[ix+1] = ay;
        acc[ix+2] = az;
    }
    return acc;
}

// ---- Barnes-Hut ----
const BH_POOL = 300000;
const BH_FIELDS = 16;
let bhData = new Float64Array(BH_POOL * BH_FIELDS);
let bhBody = new Int32Array(BH_POOL);
let bhCount = 0;

function bhReset() { bhCount = 0; }

function bhAlloc(cx, cy, cz, hs) {
    const idx = bhCount++;
    const o = idx * BH_FIELDS;
    bhData[o] = cx; bhData[o+1] = cy; bhData[o+2] = cz; bhData[o+3] = hs;
    bhData[o+4] = 0; bhData[o+5] = 0; bhData[o+6] = 0; bhData[o+7] = 0;
    for (let i = 8; i < 16; i++) bhData[o+i] = -1;
    bhBody[idx] = -1;
    return idx;
}

function bhOctant(ni, px, py, pz) {
    const o = ni * BH_FIELDS;
    let oct = 0;
    if (px > bhData[o]) oct |= 1;
    if (py > bhData[o+1]) oct |= 2;
    if (pz > bhData[o+2]) oct |= 4;
    return oct;
}

function bhChildCenter(ni, oct) {
    const o = ni * BH_FIELDS;
    const hs = bhData[o+3] * 0.5;
    return [
        bhData[o] + ((oct & 1) ? hs : -hs),
        bhData[o+1] + ((oct & 2) ? hs : -hs),
        bhData[o+2] + ((oct & 4) ? hs : -hs),
        hs
    ];
}

function bhInsert(node, bi, pos, masses) {
    let cur = node;
    for (let d = 0; d < 40; d++) {
        const co = cur * BH_FIELDS;
        if (bhData[co+4] === 0 && bhBody[cur] === -1) {
            bhBody[cur] = bi;
            bhData[co+4] = masses[bi];
            return;
        }
        const eb = bhBody[cur];
        if (eb >= 0) {
            bhBody[cur] = -1;
            const eo = bhOctant(cur, pos[eb*3], pos[eb*3+1], pos[eb*3+2]);
            if (bhData[co+8+eo] < 0) {
                const [cx,cy,cz,hs] = bhChildCenter(cur, eo);
                bhData[co+8+eo] = bhAlloc(cx,cy,cz,hs);
            }
            bhInsert(bhData[co+8+eo], eb, pos, masses);
        }
        const oct = bhOctant(cur, pos[bi*3], pos[bi*3+1], pos[bi*3+2]);
        if (bhData[co+8+oct] < 0) {
            const [cx,cy,cz,hs] = bhChildCenter(cur, oct);
            bhData[co+8+oct] = bhAlloc(cx,cy,cz,hs);
        }
        bhData[co+4] += masses[bi];
        cur = bhData[co+8+oct];
    }
}

function bhComputeCOM(ni, pos, masses) {
    if (ni < 0) return;
    const o = ni * BH_FIELDS;
    const bi = bhBody[ni];
    if (bi >= 0) {
        bhData[o+4] = masses[bi];
        bhData[o+5] = pos[bi*3]; bhData[o+6] = pos[bi*3+1]; bhData[o+7] = pos[bi*3+2];
        return;
    }
    let tm = 0, cx = 0, cy = 0, cz = 0;
    for (let c = 0; c < 8; c++) {
        const ci = bhData[o+8+c];
        if (ci >= 0) {
            bhComputeCOM(ci, pos, masses);
            const cm = bhData[ci*BH_FIELDS+4];
            tm += cm;
            cx += cm * bhData[ci*BH_FIELDS+5];
            cy += cm * bhData[ci*BH_FIELDS+6];
            cz += cm * bhData[ci*BH_FIELDS+7];
        }
    }
    if (tm > 0) {
        bhData[o+4] = tm;
        bhData[o+5] = cx/tm; bhData[o+6] = cy/tm; bhData[o+7] = cz/tm;
    }
}

function bhWalk(ni, px, py, pz, G, eps2, theta) {
    if (ni < 0) return [0,0,0];
    const o = ni * BH_FIELDS;
    const mass = bhData[o+4];
    if (mass === 0) return [0,0,0];
    const dx = bhData[o+5]-px, dy = bhData[o+6]-py, dz = bhData[o+7]-pz;
    const r2 = dx*dx + dy*dy + dz*dz + eps2;
    const size = bhData[o+3] * 2;
    let isLeaf = true;
    for (let c = 0; c < 8; c++) { if (bhData[o+8+c] >= 0) { isLeaf = false; break; } }
    if (isLeaf || (size*size)/r2 < theta*theta) {
        if (r2 < eps2*2) return [0,0,0];
        const r = Math.sqrt(r2);
        const f = G * mass / (r2 * r);
        return [f*dx, f*dy, f*dz];
    }
    let ax=0, ay=0, az=0;
    for (let c = 0; c < 8; c++) {
        const ci = bhData[o+8+c];
        if (ci >= 0) {
            const [cx,cy,cz] = bhWalk(ci, px, py, pz, G, eps2, theta);
            ax += cx; ay += cy; az += cz;
        }
    }
    return [ax, ay, az];
}

function computeAccBH(positions, masses, G, softening, theta) {
    const n = masses.length;
    const acc = new Float64Array(n * 3);
    const eps2 = softening * softening;
    if (n === 0) return acc;

    bhReset();
    let minX=Infinity,minY=Infinity,minZ=Infinity;
    let maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for (let i = 0; i < n; i++) {
        const px=positions[i*3],py=positions[i*3+1],pz=positions[i*3+2];
        if(px<minX)minX=px;if(px>maxX)maxX=px;
        if(py<minY)minY=py;if(py>maxY)maxY=py;
        if(pz<minZ)minZ=pz;if(pz>maxZ)maxZ=pz;
    }
    const cx=(minX+maxX)*0.5,cy=(minY+maxY)*0.5,cz=(minZ+maxZ)*0.5;
    const hs=Math.max(maxX-minX,maxY-minY,maxZ-minZ)*0.5+1;
    const root = bhAlloc(cx,cy,cz,hs);
    for (let i = 0; i < n; i++) bhInsert(root, i, positions, masses);
    bhComputeCOM(root, positions, masses);

    for (let i = 0; i < n; i++) {
        const [ax,ay,az] = bhWalk(root, positions[i*3], positions[i*3+1], positions[i*3+2], G, eps2, theta);
        acc[i*3]=ax; acc[i*3+1]=ay; acc[i*3+2]=az;
    }
    return acc;
}

// ---- Integrators ----
function leapfrogStep(pos, vel, masses, G, soft, dt, accFn) {
    const n = masses.length, dim = n*3;
    const a1 = accFn(pos, masses, G, soft);
    for (let i = 0; i < dim; i++) vel[i] += 0.5 * dt * a1[i];
    for (let i = 0; i < dim; i++) pos[i] += dt * vel[i];
    const a2 = accFn(pos, masses, G, soft);
    for (let i = 0; i < dim; i++) vel[i] += 0.5 * dt * a2[i];
}

function rk4Step(pos, vel, masses, G, soft, dt, accFn) {
    const n = masses.length, dim = n*3;
    const tmpP = new Float64Array(dim), tmpV = new Float64Array(dim);

    const k1v = accFn(pos, masses, G, soft);
    const k1x = new Float64Array(vel);

    for (let i=0;i<dim;i++){tmpP[i]=pos[i]+0.5*dt*k1x[i];tmpV[i]=vel[i]+0.5*dt*k1v[i];}
    const k2v = accFn(tmpP, masses, G, soft);
    const k2x = new Float64Array(tmpV);

    for (let i=0;i<dim;i++){tmpP[i]=pos[i]+0.5*dt*k2x[i];tmpV[i]=vel[i]+0.5*dt*k2v[i];}
    const k3v = accFn(tmpP, masses, G, soft);
    const k3x = new Float64Array(tmpV);

    for (let i=0;i<dim;i++){tmpP[i]=pos[i]+dt*k3x[i];tmpV[i]=vel[i]+dt*k3v[i];}
    const k4v = accFn(tmpP, masses, G, soft);
    const k4x = new Float64Array(tmpV);

    const s = dt/6;
    for (let i=0;i<dim;i++){
        pos[i]+=s*(k1x[i]+2*k2x[i]+2*k3x[i]+k4x[i]);
        vel[i]+=s*(k1v[i]+2*k2v[i]+2*k3v[i]+k4v[i]);
    }
}

// ---- Collision Detection ----
function detectCollisions(positions, masses, meta, velocities) {
    const n = masses.length;
    const collisions = [];

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dx = positions[j*3] - positions[i*3];
            const dy = positions[j*3+1] - positions[i*3+1];
            const dz = positions[j*3+2] - positions[i*3+2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const ri = meta[i].radius || 1;
            const rj = meta[j].radius || 1;

            if (dist < (ri + rj) * 0.8) {
                // Absorb smaller into larger
                const [big, small] = masses[i] >= masses[j] ? [i, j] : [j, i];
                collisions.push({ big, small });
            }
        }
    }
    return collisions;
}

function mergeBody(big, small, positions, velocities, masses, meta) {
    const totalMass = masses[big] + masses[small];
    // Conservation of momentum
    for (let d = 0; d < 3; d++) {
        velocities[big*3+d] = (masses[big] * velocities[big*3+d] + masses[small] * velocities[small*3+d]) / totalMass;
    }
    // Weighted position toward bigger body
    const w = masses[small] / totalMass;
    for (let d = 0; d < 3; d++) {
        positions[big*3+d] += w * (positions[small*3+d] - positions[big*3+d]);
    }
    // Grow radius (volume addition)
    const rBig = meta[big].radius || 1;
    const rSmall = meta[small].radius || 1;
    meta[big].radius = Math.cbrt(rBig*rBig*rBig + rSmall*rSmall*rSmall);
    masses[big] = totalMass;
}

// ---- Simulation State ----
let positions = null;
let velocities = null;
let masses = null;
let bodyMeta = [];  // [{type, name, radius, color, temperature}, ...]
let running = false;
let simTime = 0;
let collisionsEnabled = true;

let settings = {
    G: 1.0,
    integrator: 'leapfrog',
    timeStep: 0.0001,
    softening: 10,
    theta: 0.5,
    barnesHutThreshold: 1000,
    speed: 1.0,
    stepsPerFrame: 4,
};

function initBodies(bodies) {
    const n = bodies.length;
    positions = new Float64Array(n * 3);
    velocities = new Float64Array(n * 3);
    masses = new Float64Array(n);
    bodyMeta = [];

    for (let i = 0; i < n; i++) {
        const b = bodies[i];
        positions[i*3]   = b.position[0];
        positions[i*3+1] = b.position[1];
        positions[i*3+2] = b.position[2];
        velocities[i*3]   = b.velocity[0];
        velocities[i*3+1] = b.velocity[1];
        velocities[i*3+2] = b.velocity[2];
        masses[i] = b.mass;
        bodyMeta.push({
            type: b.type,
            name: b.name,
            radius: b.radius,
            color: b.color,
            temperature: b.temperature,
        });
    }
    simTime = 0;
}

function getAccFn() {
    const n = masses.length;
    const useBH = n >= settings.barnesHutThreshold;
    if (useBH) {
        return (p, m, G, s) => computeAccBH(p, m, G, s, settings.theta);
    }
    return computeAccDirect;
}

let pendingCollisionEvents = [];

function stepSimulation() {
    if (!positions || masses.length === 0) return;

    const accFn = getAccFn();
    const dt = settings.timeStep * settings.speed;
    const integrator = settings.integrator === 'rk4' ? rk4Step : leapfrogStep;

    for (let s = 0; s < settings.stepsPerFrame; s++) {
        integrator(positions, velocities, masses, settings.G, settings.softening, dt, accFn);
        simTime += dt;

        // Collision pass
        if (collisionsEnabled) {
            const hits = detectCollisions(positions, masses, bodyMeta, velocities);
            if (hits.length > 0) {
                // Process from highest index first so splicing doesn't shift indices
                const toRemove = new Set();
                for (const h of hits) {
                    if (toRemove.has(h.big) || toRemove.has(h.small)) continue;
                    pendingCollisionEvents.push({
                        survivor: bodyMeta[h.big].name,
                        absorbed: bodyMeta[h.small].name,
                        position: [positions[h.big*3], positions[h.big*3+1], positions[h.big*3+2]],
                    });
                    mergeBody(h.big, h.small, positions, velocities, masses, bodyMeta);
                    toRemove.add(h.small);
                }
                // Remove absorbed bodies (descending index order)
                const sorted = [...toRemove].sort((a, b) => b - a);
                for (const idx of sorted) {
                    removeBodyAtIndex(idx);
                }
            }
        }
    }
}

function removeBodyAtIndex(idx) {
    const n = masses.length;
    if (idx < 0 || idx >= n) return;
    const newPos = new Float64Array((n-1)*3);
    const newVel = new Float64Array((n-1)*3);
    const newMass = new Float64Array(n-1);
    let wi = 0;
    for (let i = 0; i < n; i++) {
        if (i === idx) continue;
        newPos[wi*3]=positions[i*3]; newPos[wi*3+1]=positions[i*3+1]; newPos[wi*3+2]=positions[i*3+2];
        newVel[wi*3]=velocities[i*3]; newVel[wi*3+1]=velocities[i*3+1]; newVel[wi*3+2]=velocities[i*3+2];
        newMass[wi]=masses[i];
        wi++;
    }
    positions=newPos; velocities=newVel; masses=newMass;
    bodyMeta.splice(idx, 1);
}

function computeEnergy() {
    if (!positions || masses.length === 0) return 0;
    const n = masses.length;
    const eps2 = settings.softening * settings.softening;
    let E = 0;
    for (let i = 0; i < n; i++) {
        const vx=velocities[i*3],vy=velocities[i*3+1],vz=velocities[i*3+2];
        E += 0.5 * masses[i] * (vx*vx+vy*vy+vz*vz);
        for (let j = i+1; j < n; j++) {
            const dx=positions[j*3]-positions[i*3];
            const dy=positions[j*3+1]-positions[i*3+1];
            const dz=positions[j*3+2]-positions[i*3+2];
            E -= settings.G * masses[i] * masses[j] / Math.sqrt(dx*dx+dy*dy+dz*dz+eps2);
        }
    }
    return E;
}

function sendFrame() {
    const algorithm = masses.length >= settings.barnesHutThreshold ? 'Barnes-Hut' : 'Direct';
    const events = pendingCollisionEvents.length > 0 ? pendingCollisionEvents.splice(0) : null;
    self.postMessage({
        type: 'frame',
        positions: new Float64Array(positions),
        velocities: new Float64Array(velocities),
        masses: new Float64Array(masses),
        meta: bodyMeta,
        time: simTime,
        energy: masses.length < 200 ? computeEnergy() : 0,
        algorithm,
        bodyCount: masses.length,
        collisions: events,
    });
}

let frameTimer = null;

function startLoop() {
    running = true;
    const loop = () => {
        if (!running) return;
        stepSimulation();
        sendFrame();
        frameTimer = setTimeout(loop, 1);
    };
    loop();
}

function stopLoop() {
    running = false;
    if (frameTimer) { clearTimeout(frameTimer); frameTimer = null; }
}

// ---- Message Handler ----
self.onmessage = function(e) {
    const msg = e.data;

    switch (msg.type) {
        case 'init':
            stopLoop();
            initBodies(msg.bodies || []);
            if (msg.settings) Object.assign(settings, msg.settings);
            sendFrame();
            break;

        case 'start':
            if (!running) startLoop();
            break;

        case 'stop':
            stopLoop();
            break;

        case 'step':
            stepSimulation();
            sendFrame();
            break;

        case 'updateSettings':
            if (msg.settings.collisions !== undefined) {
                collisionsEnabled = msg.settings.collisions;
            }
            Object.assign(settings, msg.settings);
            break;

        case 'addBody': {
            const b = msg.body;
            const n = masses.length;
            const newPos = new Float64Array(n*3 + 3);
            const newVel = new Float64Array(n*3 + 3);
            const newMass = new Float64Array(n + 1);
            newPos.set(positions); newVel.set(velocities); newMass.set(masses);
            newPos[n*3]   = b.position[0];
            newPos[n*3+1] = b.position[1];
            newPos[n*3+2] = b.position[2];
            newVel[n*3]   = b.velocity[0];
            newVel[n*3+1] = b.velocity[1];
            newVel[n*3+2] = b.velocity[2];
            newMass[n] = b.mass;
            positions = newPos; velocities = newVel; masses = newMass;
            bodyMeta.push({
                type: b.type, name: b.name, radius: b.radius,
                color: b.color, temperature: b.temperature,
            });
            sendFrame();
            break;
        }

        case 'removeBody': {
            removeBodyAtIndex(msg.index);
            sendFrame();
            break;
        }

        case 'updateBody': {
            const { index, props } = msg;
            if (index < 0 || index >= masses.length) break;
            if (props.mass !== undefined) masses[index] = props.mass;
            if (props.position) {
                positions[index*3]=props.position[0];
                positions[index*3+1]=props.position[1];
                positions[index*3+2]=props.position[2];
            }
            if (props.velocity) {
                velocities[index*3]=props.velocity[0];
                velocities[index*3+1]=props.velocity[1];
                velocities[index*3+2]=props.velocity[2];
            }
            if (props.name !== undefined) bodyMeta[index].name = props.name;
            if (props.radius !== undefined) bodyMeta[index].radius = props.radius;
            if (props.color !== undefined) bodyMeta[index].color = props.color;
            if (props.temperature !== undefined) bodyMeta[index].temperature = props.temperature;
            sendFrame();
            break;
        }

        case 'getState':
            sendFrame();
            break;
    }
};
