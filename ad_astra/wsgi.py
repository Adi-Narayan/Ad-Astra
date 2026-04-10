"""WSGI config for Ad Astra project."""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ad_astra.settings')
application = get_wsgi_application()
