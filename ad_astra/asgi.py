"""ASGI config for Ad Astra project."""
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ad_astra.settings')
application = get_asgi_application()
