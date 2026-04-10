from django.contrib import admin
from .models import Simulation, SimulationSnapshot, Preset


@admin.register(Preset)
class PresetAdmin(admin.ModelAdmin):
    list_display = ['name', 'thumbnail', 'order']
    list_editable = ['order']


@admin.register(Simulation)
class SimulationAdmin(admin.ModelAdmin):
    list_display = ['name', 'user', 'is_public', 'created_at', 'updated_at']
    list_filter = ['is_public', 'created_at']
    search_fields = ['name', 'user__username']


@admin.register(SimulationSnapshot)
class SnapshotAdmin(admin.ModelAdmin):
    list_display = ['simulation', 'sim_time', 'created_at']
