from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'presets', views.PresetViewSet)
router.register(r'simulations', views.SimulationViewSet, basename='simulation')

urlpatterns = [
    path('', include(router.urls)),
    path('shared/<uuid:share_token>/', views.shared_simulation, name='shared-simulation'),
    path('user/', views.current_user, name='current-user'),
]
