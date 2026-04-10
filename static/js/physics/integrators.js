/**
 * Ad Astra — Numerical Integrators
 * Leapfrog (symplectic) and RK4 (4th-order Runge-Kutta)
 */

/**
 * Compute gravitational accelerations for all bodies using direct N-body O(n²).
 * @param {Float64Array} positions  - [x0,y0,z0, x1,y1,z1, ...]
 * @param {Float64Array} masses     - [m0, m1, ...]
 * @param {number}       G          - gravitational constant
 * @param {number}       softening  - softening length to avoid singularities
 * @returns {Float64Array} accelerations [ax0,ay0,az0, ...]
 */
export function computeAccelerationsDirect(positions, masses, G, softening) {
    const n = masses.length;
    const acc = new Float64Array(n * 3);
    const eps2 = softening * softening;

    for (let i = 0; i < n; i++) {
        const ix = i * 3, iy = ix + 1, iz = ix + 2;
        let ax = 0, ay = 0, az = 0;

        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const jx = j * 3, jy = jx + 1, jz = jx + 2;

            const dx = positions[jx] - positions[ix];
            const dy = positions[jy] - positions[iy];
            const dz = positions[jz] - positions[iz];

            const r2 = dx * dx + dy * dy + dz * dz + eps2;
            const r = Math.sqrt(r2);
            const f = G * masses[j] / (r2 * r);

            ax += f * dx;
            ay += f * dy;
            az += f * dz;
        }

        acc[ix] = ax;
        acc[iy] = ay;
        acc[iz] = az;
    }

    return acc;
}

/**
 * Leapfrog (Kick-Drift-Kick) integrator — symplectic, excellent for orbital mechanics.
 */
export function leapfrogStep(positions, velocities, masses, G, softening, dt, computeAcc) {
    const n = masses.length;

    // Half-kick
    const acc1 = computeAcc(positions, masses, G, softening);
    for (let i = 0; i < n * 3; i++) {
        velocities[i] += 0.5 * dt * acc1[i];
    }

    // Full drift
    for (let i = 0; i < n * 3; i++) {
        positions[i] += dt * velocities[i];
    }

    // Half-kick
    const acc2 = computeAcc(positions, masses, G, softening);
    for (let i = 0; i < n * 3; i++) {
        velocities[i] += 0.5 * dt * acc2[i];
    }
}

/**
 * RK4 (4th-order Runge-Kutta) integrator — higher accuracy, non-symplectic.
 */
export function rk4Step(positions, velocities, masses, G, softening, dt, computeAcc) {
    const n = masses.length;
    const dim = n * 3;

    // State: y = [positions, velocities]
    const tmpPos = new Float64Array(dim);
    const tmpVel = new Float64Array(dim);

    // k1
    const k1v = computeAcc(positions, masses, G, softening);          // dv/dt = acc
    const k1x = new Float64Array(velocities);                          // dx/dt = vel

    // k2
    for (let i = 0; i < dim; i++) {
        tmpPos[i] = positions[i] + 0.5 * dt * k1x[i];
        tmpVel[i] = velocities[i] + 0.5 * dt * k1v[i];
    }
    const k2v = computeAcc(tmpPos, masses, G, softening);
    const k2x = new Float64Array(tmpVel);

    // k3
    for (let i = 0; i < dim; i++) {
        tmpPos[i] = positions[i] + 0.5 * dt * k2x[i];
        tmpVel[i] = velocities[i] + 0.5 * dt * k2v[i];
    }
    const k3v = computeAcc(tmpPos, masses, G, softening);
    const k3x = new Float64Array(tmpVel);

    // k4
    for (let i = 0; i < dim; i++) {
        tmpPos[i] = positions[i] + dt * k3x[i];
        tmpVel[i] = velocities[i] + dt * k3v[i];
    }
    const k4v = computeAcc(tmpPos, masses, G, softening);
    const k4x = new Float64Array(tmpVel);

    // Combine
    const sixth = dt / 6.0;
    for (let i = 0; i < dim; i++) {
        positions[i]  += sixth * (k1x[i] + 2*k2x[i] + 2*k3x[i] + k4x[i]);
        velocities[i] += sixth * (k1v[i] + 2*k2v[i] + 2*k3v[i] + k4v[i]);
    }
}

/**
 * Compute total energy (kinetic + potential) for diagnostics.
 */
export function computeTotalEnergy(positions, velocities, masses, G, softening) {
    const n = masses.length;
    const eps2 = softening * softening;
    let KE = 0, PE = 0;

    for (let i = 0; i < n; i++) {
        const vx = velocities[i*3], vy = velocities[i*3+1], vz = velocities[i*3+2];
        KE += 0.5 * masses[i] * (vx*vx + vy*vy + vz*vz);

        for (let j = i + 1; j < n; j++) {
            const dx = positions[j*3]   - positions[i*3];
            const dy = positions[j*3+1] - positions[i*3+1];
            const dz = positions[j*3+2] - positions[i*3+2];
            const r = Math.sqrt(dx*dx + dy*dy + dz*dz + eps2);
            PE -= G * masses[i] * masses[j] / r;
        }
    }

    return KE + PE;
}
