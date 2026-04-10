import uuid
from django.db import models
from django.conf import settings


class Preset(models.Model):
    """Built-in simulation presets (Solar System, Binary Stars, etc.)."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    state = models.JSONField(help_text='Array of celestial body definitions')
    settings = models.JSONField(
        default=dict,
        help_text='Simulation settings: integrator, timeStep, etc.'
    )
    thumbnail = models.CharField(max_length=10, default='🌍', help_text='Emoji thumbnail')
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.name


class Simulation(models.Model):
    """User-saved simulation state."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='simulations',
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=200, default='Untitled Simulation')
    description = models.TextField(blank=True)
    state = models.JSONField(
        default=list,
        help_text='Array of body objects: {type, name, mass, radius, position, velocity, color, ...}'
    )
    sim_settings = models.JSONField(
        default=dict,
        help_text='Simulation settings: integrator, timeStep, trailLength, etc.'
    )
    share_token = models.UUIDField(default=uuid.uuid4, unique=True)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.name} ({self.user or "guest"})'


class SimulationSnapshot(models.Model):
    """Timestamped snapshot for rewind functionality."""
    simulation = models.ForeignKey(
        Simulation,
        on_delete=models.CASCADE,
        related_name='snapshots',
    )
    state = models.JSONField()
    sim_time = models.FloatField(help_text='Simulation time at snapshot')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sim_time']

    def __str__(self):
        return f'Snapshot @ t={self.sim_time:.2f} of {self.simulation.name}'
