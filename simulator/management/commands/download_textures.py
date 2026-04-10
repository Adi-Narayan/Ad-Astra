"""Download planet textures from Solar System Scope (CC BY 4.0)."""
import os
import urllib.request
import ssl
from pathlib import Path
from django.core.management.base import BaseCommand
from django.conf import settings

BASE_URL = 'https://www.solarsystemscope.com/textures/download/'

TEXTURES = {
    'sun.jpg': '2k_sun.jpg',
    'mercury.jpg': '2k_mercury.jpg',
    'venus.jpg': '2k_venus_surface.jpg',
    'earth.jpg': '2k_earth_daymap.jpg',
    'moon.jpg': '2k_moon.jpg',
    'mars.jpg': '2k_mars.jpg',
    'jupiter.jpg': '2k_jupiter.jpg',
    'saturn.jpg': '2k_saturn.jpg',
    'saturn_ring.png': '2k_saturn_ring_alpha.png',
    'uranus.jpg': '2k_uranus.jpg',
    'neptune.jpg': '2k_neptune.jpg',
    'milkyway.jpg': '2k_stars_milky_way.jpg',
}


class Command(BaseCommand):
    help = 'Download planet textures and Milky Way skybox for the 3D renderer'

    def handle(self, *args, **options):
        texture_dir = Path(settings.BASE_DIR) / 'static' / 'textures'
        texture_dir.mkdir(parents=True, exist_ok=True)

        self.stdout.write('Downloading textures from Solar System Scope (CC BY 4.0)...\n')

        success = 0
        for local_name, remote_name in TEXTURES.items():
            target = texture_dir / local_name
            if target.exists():
                self.stdout.write(f'  Exists: {local_name}')
                success += 1
                continue

            url = BASE_URL + remote_name
            self.stdout.write(f'  Fetching {local_name} ...', ending='')
            try:
                req = urllib.request.Request(url, headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; AdAstra/1.0)',
                })
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = resp.read()
                with open(target, 'wb') as f:
                    f.write(data)
                size_kb = len(data) / 1024
                self.stdout.write(self.style.SUCCESS(f' OK ({size_kb:.0f} KB)'))
                success += 1
            except Exception as e:
                self.stdout.write(self.style.WARNING(f' FAILED: {e}'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'Downloaded {success}/{len(TEXTURES)} textures to static/textures/'
        ))
        if success < len(TEXTURES):
            self.stdout.write(self.style.WARNING(
                'Some textures failed. The simulator will use procedural shaders as fallback.'
            ))
