# Ad Astra — Solar System Simulator

A real-time, browser-based N-body physics simulator with GPU-rendered celestial bodies, planetary atmospheres, rings, and accretion discs.

## Features

- **N-Body Physics** — Accurate gravitational interactions with Leapfrog and RK4 integrators
- **Barnes-Hut Optimization** — Efficiently simulates 500+ bodies with O(n log n) complexity
- **Collision Detection** — Bodies merge via momentum-conserving absorption
- **GPU Rendering** — Three.js with procedural GLSL shaders for stars, planets, black holes
- **Textured Bodies** — Real textures for all Solar System objects (Sun, planets, moons)
- **Atmospheric Effects** — Procedural atmosphere glows for Earth, Venus, Jupiter, etc.
- **Planetary Rings** — Saturn and Uranus rings with proper tilt and opacity
- **Black Holes** — Accretion disc rendering and event horizon visualization
- **Web Workers** — Physics runs off the main thread for smooth 60 FPS rendering
- **Cloud Save** — Save/load simulations, generate shareable links
- **Presets** — Pre-built scenarios (Solar System, binary stars, nebula clusters)

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Download planet textures (one-time)
python manage.py download_textures

# Seed example presets
python manage.py seed_presets

# Run development server
python manage.py runserver
```

Then visit **http://127.0.0.1:8000** in your browser.

## Usage

### Adding Bodies

Click the **+** button in the left panel to add a new star, planet, moon, black hole, or asteroid.

### Editing Bodies

**Click a body to select it** — the properties panel opens on the right. You can edit:
- **Name** — click to rename
- **Mass** — change gravitational influence
- **Radius** — change size (volume grows proportionally on collisions)

Position and velocity are read-only but update in real-time as the simulation progresses.

### Simulation Controls

- **Play/Pause** — ⏸ button
- **Step** — ⏭ advance one frame
- **Reset** — ↺ reload current preset
- **Speed slider** — 0.1x to 10.0x simulation speed
- **Trails** — 〰 toggle orbital paths
- **Labels** — Aa toggle body names
- **Grid** — ⊞ toggle background grid
- **Fullscreen** — ⛶

### Settings

Click the **⚙** gear icon to access:
- **Integrator** — Leapfrog (symplectic) or RK4 (high accuracy)
- **Time Step** — Physics timestep (smaller = more accurate but slower)
- **Trail Length** — How many frames to remember for orbital trails
- **Softening** — Smoothing parameter to prevent singularities
- **Barnes-Hut θ** — Accuracy threshold for tree algorithm
- **Bloom** — Post-processing glow effect
- **Collisions** — Enable/disable body merging

### Saving & Sharing

Click **💾** to save your simulation. You get a shareable link that anyone can view (even without logging in).

## File Structure

```
ad-astra/
├── ad_astra/              # Django project settings
│   ├── settings.py        # Configuration + production env vars
│   ├── urls.py            # URL routing
│   └── wsgi.py            # WSGI entry point
├── accounts/              # User authentication app
├── simulator/             # Main simulator app
│   ├── models.py          # Preset & Simulation database models
│   ├── views.py           # API endpoints for presets/simulations
│   ├── management/
│   │   └── commands/
│   │       ├── download_textures.py    # Fetch planet textures
│   │       └── seed_presets.py         # Load example scenarios
│   └── urls.py            # API routes
├── static/
│   ├── css/style.css      # Main stylesheet (dark theme)
│   ├── js/
│   │   ├── main.js        # Main UI & worker orchestration
│   │   ├── renderer/
│   │   │   ├── scene.js   # Three.js scene manager
│   │   │   └── shaders.js # GLSL vertex/fragment shaders
│   │   └── physics/
│   │       └── worker.js  # N-body physics (Web Worker)
│   └── textures/          # Planet surface maps (auto-downloaded)
├── templates/
│   ├── base.html          # Base template
│   ├── index.html         # Landing page
│   ├── simulator.html     # Main simulator page
│   └── accounts/          # Login/register/profile pages
├── manage.py              # Django CLI
├── Procfile               # Heroku/Railway deployment
├── railway.json           # Railway-specific config
└── requirements.txt       # Python dependencies
```

## Physics Implementation

### Integrators

- **Leapfrog (Velocity Verlet)** — Symplectic, energy-conserving, fast. Default.
- **RK4** — Higher accuracy, slightly slower. Good for long-term stability checks.

### Acceleration Computation

- **Direct O(n²)** — Accurate but slow for n > 1000. Used for small systems.
- **Barnes-Hut O(n log n)** — Approximates distant bodies as single mass. Auto-switches at 1000 bodies.

### Collisions

When two bodies overlap (within 80% of combined radii):
- Smaller body absorbed into larger
- Velocities merged via momentum conservation
- Position weighted toward larger body
- Radii combined via volume addition (∛(r₁³ + r₂³))

## Database

Uses **SQLite** locally (included in repo). In production (Railway), it persists in Railway's ephemeral filesystem — for permanent storage, connect to Railway Postgres.

## Environment Variables

| Variable | Purpose | Example |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django security key | `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DEBUG` | Debug mode (set to `False` in production) | `False` |
| `ALLOWED_HOSTS` | Allowed domain names | `localhost,127.0.0.1,my-app.up.railway.app` |
| `CSRF_TRUSTED_ORIGINS` | CSRF whitelist (for cross-origin POST) | `https://my-app.up.railway.app` |

## Troubleshooting

**Q: Bodies are too dark / no textures showing**
- Hard refresh: **Ctrl+Shift+R**
- Run `python manage.py download_textures` if textures weren't downloaded

**Q: Simulation is slow with many bodies**
- Reduce trail length (Settings panel)
- Increase time step
- Reduce bloom effect

**Q: Can't save simulations**
- You must be logged in. Go to `/accounts/login/` or register.
- Guest mode loads/edits but can't persist.

## Credits

- **Textures**: Solar System Scope (CC BY 4.0)
- **Three.js**: Matterjs rendering
- **Milky Way Panorama**: NASA/ESA
- **Physics Algorithm**: Barnes-Hut octree from classical N-body literature

## License

MIT (project), CC BY 4.0 (textures)

---

**Made with ✦ by [Your Team]**
