"""Management command to seed default simulation presets with accurate physics."""
import math
from django.core.management.base import BaseCommand
from simulator.models import Preset

# G calibrated so that orbital velocities match real km/s values
# at the display scale (positions in millions of km, velocities in km/s).
# v = sqrt(G * M_sun / r) gives correct orbital velocities.
G = 0.133


def _orbital_body(r, angle_deg, mass, name, btype, radius, color, temp, v_override=None):
    """Place a body in a circular orbit at the given distance and angle."""
    theta = math.radians(angle_deg)
    v = v_override or math.sqrt(G * 1_000_000 / r)
    return {
        'type': btype, 'name': name, 'mass': mass,
        'radius': radius, 'color': color, 'temperature': temp,
        'position': [
            round(r * math.cos(theta), 2),
            0,
            round(r * math.sin(theta), 2),
        ],
        'velocity': [
            round(-v * math.sin(theta), 2),
            0,
            round(v * math.cos(theta), 2),
        ],
    }


PRESETS = [
    {
        'name': 'Solar System',
        'description': 'The Sun, 8 planets, dwarf planets Pluto & Ceres, the Moon, and 5 named asteroids.',
        'thumbnail': '☀️',
        'order': 1,
        'settings': {
            'G': G,
            'integrator': 'leapfrog',
            'timeStep': 0.001,
            'trailLength': 500,
            'softening': 5,
        },
        'state': [
            # Sun
            {
                'type': 'star', 'name': 'Sun', 'mass': 1_000_000,
                'radius': 20, 'temperature': 5778,
                'position': [0, 0, 0], 'velocity': [0, 0, 0],
            },
            # Mercury — 57.9M km, 47.87 km/s
            _orbital_body(58, 0, 0.166, 'Mercury', 'planet', 2.4, '#b5a7a7', 440),
            # Venus — 108.2M km, 35.02 km/s
            _orbital_body(108, 0, 2.447, 'Venus', 'planet', 3.7, '#e8cda2', 737),
            # Earth — 149.6M km, 29.78 km/s
            _orbital_body(150, 0, 3.003, 'Earth', 'planet', 4.0, '#4169e1', 288),
            # Moon — 0.384M km from Earth
            {
                'type': 'moon', 'name': 'Moon', 'mass': 0.037,
                'radius': 1.2, 'color': '#aaaaaa', 'temperature': 250,
                'position': [150.384, 0, 0], 'velocity': [0, 0, 30.80],
            },
            # Mars — 227.9M km, 24.07 km/s
            _orbital_body(228, 0, 0.322, 'Mars', 'planet', 3.4, '#c1440e', 210),
            # Ceres — 413.9M km (dwarf planet)
            _orbital_body(414, 170, 0.00047, 'Ceres', 'dwarf', 1.0, '#8c8c8c', 168),
            # Jupiter — 778.5M km, 13.07 km/s
            _orbital_body(778, 0, 954.79, 'Jupiter', 'planet', 11, '#c9b48e', 165),
            # Saturn — 1432M km, 9.69 km/s
            _orbital_body(1427, 0, 285.88, 'Saturn', 'planet', 9, '#ead6b8', 134),
            # Uranus — 2867M km, 6.81 km/s
            _orbital_body(2871, 0, 43.66, 'Uranus', 'planet', 6, '#d1e7e7', 76),
            # Neptune — 4515M km, 5.43 km/s
            _orbital_body(4497, 0, 51.51, 'Neptune', 'planet', 5.8, '#3f54ba', 72),
            # Pluto — 5906M km (dwarf planet)
            _orbital_body(5906, 0, 0.0066, 'Pluto', 'dwarf', 0.9, '#d2b48c', 44),
            # --- 5 Named Asteroids ---
            # Vesta — 353M km
            _orbital_body(353, 45, 0.000130, 'Vesta', 'asteroid', 1.5, '#8c8c7c', 170),
            # Pallas — 415M km
            _orbital_body(415, 130, 0.000103, 'Pallas', 'asteroid', 1.5, '#7c8c7c', 164),
            # Hygiea — 470M km
            _orbital_body(470, 210, 0.000042, 'Hygiea', 'asteroid', 1.3, '#8c7c6c', 160),
            # Juno — 399M km
            _orbital_body(399, 290, 0.000013, 'Juno', 'asteroid', 1.0, '#9c8c7c', 163),
            # Eros — 218M km (near-Earth)
            _orbital_body(218, 350, 0.000001, 'Eros', 'asteroid', 0.8, '#aa8866', 227),
        ],
    },
    {
        'name': 'Binary Star System',
        'description': 'Two stars orbiting their common center of mass with a circumbinary planet.',
        'thumbnail': '⭐',
        'order': 2,
        'settings': {
            'G': G,
            'integrator': 'rk4',
            'timeStep': 0.0005,
            'trailLength': 800,
            'softening': 8,
        },
        'state': [
            {
                'type': 'star', 'name': 'Star A', 'mass': 800_000,
                'radius': 18, 'temperature': 6500,
                'position': [-80, 0, 0], 'velocity': [0, 0, -14.6],
            },
            {
                'type': 'star', 'name': 'Star B', 'mass': 600_000,
                'radius': 14, 'temperature': 4200,
                'position': [80, 0, 0], 'velocity': [0, 0, 19.5],
            },
            {
                'type': 'planet', 'name': 'Circumbinary Planet', 'mass': 5,
                'radius': 5, 'color': '#66cdaa', 'temperature': 310,
                'position': [400, 0, 0], 'velocity': [0, 0, 21.6],
            },
        ],
    },
    {
        'name': 'Black Hole Accretion',
        'description': 'A supermassive black hole with an orbiting star and debris.',
        'thumbnail': '🕳️',
        'order': 3,
        'settings': {
            'G': G,
            'integrator': 'rk4',
            'timeStep': 0.0003,
            'trailLength': 400,
            'softening': 8,
        },
        'state': [
            {
                'type': 'blackhole', 'name': 'Sagittarius A*', 'mass': 5_000_000,
                'radius': 30, 'color': '#000000',
                'position': [0, 0, 0], 'velocity': [0, 0, 0],
            },
            {
                'type': 'star', 'name': 'S2 Star', 'mass': 50_000,
                'radius': 6, 'temperature': 22000,
                'position': [200, 0, 0], 'velocity': [0, 25, 50],
            },
            {
                'type': 'planet', 'name': 'Debris A', 'mass': 1,
                'radius': 2, 'color': '#ff6347', 'temperature': 800,
                'position': [120, 50, 0], 'velocity': [0, -20, 60],
            },
            {
                'type': 'planet', 'name': 'Debris B', 'mass': 1,
                'radius': 2, 'color': '#ffa500', 'temperature': 650,
                'position': [-100, 0, 80], 'velocity': [30, 0, -50],
            },
            {
                'type': 'planet', 'name': 'Debris C', 'mass': 0.5,
                'radius': 1.5, 'color': '#ff4500', 'temperature': 900,
                'position': [0, 150, 0], 'velocity': [-55, 0, 30],
            },
        ],
    },
    {
        'name': 'Figure-Eight',
        'description': 'Three equal-mass bodies in a stable figure-eight orbit (Chenciner & Montgomery).',
        'thumbnail': '♾️',
        'order': 4,
        'settings': {
            'G': G,
            'integrator': 'rk4',
            'timeStep': 0.0005,
            'trailLength': 1200,
            'softening': 5,
        },
        'state': [
            {
                'type': 'star', 'name': 'Body A', 'mass': 500_000,
                'radius': 10, 'temperature': 7000,
                'position': [-97.00, 0, -24.31],
                'velocity': [12.02, 0, 11.15],
            },
            {
                'type': 'star', 'name': 'Body B', 'mass': 500_000,
                'radius': 10, 'temperature': 4500,
                'position': [97.00, 0, 24.31],
                'velocity': [12.02, 0, 11.15],
            },
            {
                'type': 'star', 'name': 'Body C', 'mass': 500_000,
                'radius': 10, 'temperature': 10000,
                'position': [0, 0, 0],
                'velocity': [-24.05, 0, -22.31],
            },
        ],
    },
    {
        'name': 'Nebula Cluster',
        'description': 'A dense star cluster collapsing under mutual gravity — Barnes-Hut stress test.',
        'thumbnail': '🌌',
        'order': 5,
        'settings': {
            'G': G,
            'integrator': 'leapfrog',
            'timeStep': 0.001,
            'trailLength': 0,
            'softening': 12,
            'generateCluster': 200,
            'clusterRadius': 600,
        },
        'state': [
            {
                'type': 'star', 'name': 'Central Mass', 'mass': 2_000_000,
                'radius': 25, 'temperature': 30000,
                'position': [0, 0, 0], 'velocity': [0, 0, 0],
            },
        ],
    },
]


class Command(BaseCommand):
    help = 'Seed the database with default simulation presets'

    def handle(self, *args, **options):
        for data in PRESETS:
            preset, created = Preset.objects.update_or_create(
                name=data['name'],
                defaults=data,
            )
            action = 'Created' if created else 'Updated'
            self.stdout.write(f'{action} preset: {preset.name}')

        self.stdout.write(self.style.SUCCESS(f'Successfully seeded {len(PRESETS)} presets'))
