"""Ad Astra URL Configuration."""
from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('accounts.urls')),
    path('api/', include('simulator.urls')),
    path('simulate/', TemplateView.as_view(template_name='simulator.html'), name='simulator'),
    path('simulate/<uuid:share_token>/', TemplateView.as_view(template_name='simulator.html'), name='simulator_shared'),
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
]
