from rest_framework import serializers
from .models import Simulation, SimulationSnapshot, Preset


class PresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Preset
        fields = ['id', 'name', 'description', 'state', 'settings', 'thumbnail', 'order']


class SimulationSerializer(serializers.ModelSerializer):
    owner = serializers.ReadOnlyField(source='user.username')
    share_url = serializers.SerializerMethodField()

    class Meta:
        model = Simulation
        fields = [
            'id', 'owner', 'name', 'description', 'state', 'sim_settings',
            'share_token', 'is_public', 'created_at', 'updated_at', 'share_url',
        ]
        read_only_fields = ['id', 'share_token', 'created_at', 'updated_at']

    def get_share_url(self, obj):
        request = self.context.get('request')
        if request and obj.is_public:
            return request.build_absolute_uri(f'/simulate/{obj.share_token}/')
        return None


class SnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationSnapshot
        fields = ['id', 'simulation', 'state', 'sim_time', 'created_at']
        read_only_fields = ['id', 'created_at']
