web: python manage.py migrate --noinput && python manage.py seed_presets && gunicorn ad_astra.wsgi --bind 0.0.0.0:$PORT
