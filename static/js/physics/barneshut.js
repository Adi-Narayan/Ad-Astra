/**
 * Ad Astra — Barnes-Hut Octree Algorithm
 * Reduces N-body gravity from O(n²) to O(n log n).
 *
 * The octree recursively subdivides 3D space into octants. Distant groups of
 * bodies are approximated by their center of mass, controlled by the opening
 * angle parameter θ (theta). Smaller θ = more accurate but slower.
 */

// Octree node pool for performance (avoids GC pressure)
const NODE_POOL_SIZE = 500000;
let nodePool = null;
let nodeCount = 0;

// Each node: [cx, cy, cz, halfSize, totalMass, comX, comY, comZ, child0..child7, bodyIndex, isLeaf]
// Stored as flat arrays for cache friendliness
const FIELDS = 16;  // fields per node
let nodeData = null;

function initPool() {
    if (nodeData && nodeData.length >= NODE_POOL_SIZE * FIELDS) return;
    nodeData = new Float64Array(NODE_POOL_SIZE * FIELDS);
    nodePool = true;
}

function resetPool() {
    nodeCount = 0;
}

function allocNode(cx, cy, cz, halfSize) {
    const idx = nodeCount++;
    const off = idx * FIELDS;
    nodeData[off + 0] = cx;         // center x
    nodeData[off + 1] = cy;         // center y
    nodeData[off + 2] = cz;         // center z
    nodeData[off + 3] = halfSize;   // half-size
    nodeData[off + 4] = 0;          // total mass
    nodeData[off + 5] = 0;          // CoM x
    nodeData[off + 6] = 0;          // CoM y
    nodeData[off + 7] = 0;          // CoM z
    // children indices (8-15): -1 = no child
    for (let i = 8; i < 16; i++) nodeData[off + i] = -1;
    return idx;
}

function getOctant(nodeIdx, px, py, pz) {
    const off = nodeIdx * FIELDS;
    let octant = 0;
    if (px > nodeData[off + 0]) octant |= 1;
    if (py > nodeData[off + 1]) octant |= 2;
    if (pz > nodeData[off + 2]) octant |= 4;
    return octant;
}

function childCenter(nodeIdx, octant) {
    const off = nodeIdx * FIELDS;
    const hs = nodeData[off + 3] * 0.5;
    return [
        nodeData[off + 0] + ((octant & 1) ? hs : -hs),
        nodeData[off + 1] + ((octant & 2) ? hs : -hs),
        nodeData[off + 2] + ((octant & 4) ? hs : -hs),
        hs
    ];
}

/**
 * Build the Barnes-Hut octree from body positions and masses.
 */
export function buildOctree(positions, masses) {
    initPool();
    resetPool();

    const n = masses.length;
    if (n === 0) return -1;

    // Find bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < n; i++) {
        const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
    }

    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const halfSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + 1;

    const root = allocNode(cx, cy, cz, halfSize);

    // Insert bodies
    // Track body indices in each leaf: store as bodyIndex in field using a side array
    const bodyOfNode = new Int32Array(NODE_POOL_SIZE).fill(-1);

    for (let i = 0; i < n; i++) {
        insertBody(root, i, positions, masses, bodyOfNode);
    }

    // Compute centers of mass bottom-up
    computeCOM(root, bodyOfNode, positions, masses);

    return { root, bodyOfNode };
}

function insertBody(nodeIdx, bodyIdx, positions, masses, bodyOfNode) {
    const off = nodeIdx * FIELDS;
    const depth_limit = 40;  // prevent infinite recursion

    let currentNode = nodeIdx;
    let depth = 0;

    while (depth < depth_limit) {
        const cOff = currentNode * FIELDS;

        if (nodeData[cOff + 4] === 0 && bodyOfNode[currentNode] === -1) {
            // Empty node — place body here
            bodyOfNode[currentNode] = bodyIdx;
            nodeData[cOff + 4] = masses[bodyIdx];
            return;
        }

        // Node has a body or children — need to subdivide
        const existingBody = bodyOfNode[currentNode];
        if (existingBody >= 0) {
            // Move existing body to a child
            bodyOfNode[currentNode] = -1;  // no longer a leaf with direct body

            const eOctant = getOctant(currentNode, positions[existingBody*3], positions[existingBody*3+1], positions[existingBody*3+2]);
            if (nodeData[cOff + 8 + eOctant] < 0) {
                const [ccx, ccy, ccz, chs] = childCenter(currentNode, eOctant);
                nodeData[cOff + 8 + eOctant] = allocNode(ccx, ccy, ccz, chs);
            }
            insertBody(nodeData[cOff + 8 + eOctant], existingBody, positions, masses, bodyOfNode);
        }

        // Insert new body into appropriate child
        const octant = getOctant(currentNode, positions[bodyIdx*3], positions[bodyIdx*3+1], positions[bodyIdx*3+2]);
        if (nodeData[cOff + 8 + octant] < 0) {
            const [ccx, ccy, ccz, chs] = childCenter(currentNode, octant);
            nodeData[cOff + 8 + octant] = allocNode(ccx, ccy, ccz, chs);
        }

        nodeData[cOff + 4] += masses[bodyIdx];
        currentNode = nodeData[cOff + 8 + octant];
        depth++;
    }
}

function computeCOM(nodeIdx, bodyOfNode, positions, masses) {
    if (nodeIdx < 0) return;
    const off = nodeIdx * FIELDS;

    // If leaf with body
    const bi = bodyOfNode[nodeIdx];
    if (bi >= 0) {
        nodeData[off + 4] = masses[bi];
        nodeData[off + 5] = positions[bi * 3];
        nodeData[off + 6] = positions[bi * 3 + 1];
        nodeData[off + 7] = positions[bi * 3 + 2];
        return;
    }

    let totalMass = 0, comX = 0, comY = 0, comZ = 0;
    let hasChildren = false;

    for (let c = 0; c < 8; c++) {
        const childIdx = nodeData[off + 8 + c];
        if (childIdx >= 0) {
            hasChildren = true;
            computeCOM(childIdx, bodyOfNode, positions, masses);
            const cOff = childIdx * FIELDS;
            const cm = nodeData[cOff + 4];
            totalMass += cm;
            comX += cm * nodeData[cOff + 5];
            comY += cm * nodeData[cOff + 6];
            comZ += cm * nodeData[cOff + 7];
        }
    }

    if (totalMass > 0) {
        nodeData[off + 4] = totalMass;
        nodeData[off + 5] = comX / totalMass;
        nodeData[off + 6] = comY / totalMass;
        nodeData[off + 7] = comZ / totalMass;
    }
}

/**
 * Compute acceleration on a single body using the Barnes-Hut tree walk.
 */
function treeWalkAccel(nodeIdx, px, py, pz, G, eps2, theta) {
    if (nodeIdx < 0) return [0, 0, 0];
    const off = nodeIdx * FIELDS;

    const mass = nodeData[off + 4];
    if (mass === 0) return [0, 0, 0];

    const dx = nodeData[off + 5] - px;
    const dy = nodeData[off + 6] - py;
    const dz = nodeData[off + 7] - pz;
    const r2 = dx * dx + dy * dy + dz * dz + eps2;

    const size = nodeData[off + 3] * 2;  // full size of node

    // Check if this node is a leaf or can be approximated
    let isLeaf = true;
    for (let c = 0; c < 8; c++) {
        if (nodeData[off + 8 + c] >= 0) { isLeaf = false; break; }
    }

    if (isLeaf || (size * size) / r2 < theta * theta) {
        // Use this node's center of mass as approximation
        if (r2 < eps2 * 2) return [0, 0, 0];  // skip self
        const r = Math.sqrt(r2);
        const f = G * mass / (r2 * r);
        return [f * dx, f * dy, f * dz];
    }

    // Recurse into children
    let ax = 0, ay = 0, az = 0;
    for (let c = 0; c < 8; c++) {
        const childIdx = nodeData[off + 8 + c];
        if (childIdx >= 0) {
            const [cax, cay, caz] = treeWalkAccel(childIdx, px, py, pz, G, eps2, theta);
            ax += cax;
            ay += cay;
            az += caz;
        }
    }
    return [ax, ay, az];
}

/**
 * Compute gravitational accelerations using Barnes-Hut.
 * @param {Float64Array} positions
 * @param {Float64Array} masses
 * @param {number} G
 * @param {number} softening
 * @param {number} theta - Opening angle (0.5 is a good default)
 * @returns {Float64Array} accelerations
 */
export function computeAccelerationsBarnesHut(positions, masses, G, softening, theta = 0.5) {
    const n = masses.length;
    const acc = new Float64Array(n * 3);
    const eps2 = softening * softening;

    const tree = buildOctree(positions, masses);
    if (!tree || tree.root < 0) return acc;

    for (let i = 0; i < n; i++) {
        const [ax, ay, az] = treeWalkAccel(
            tree.root,
            positions[i*3], positions[i*3+1], positions[i*3+2],
            G, eps2, theta
        );
        acc[i*3]     = ax;
        acc[i*3 + 1] = ay;
        acc[i*3 + 2] = az;
    }

    return acc;
}
