from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Simulation, SimulationSnapshot, Preset
from .serializers import SimulationSerializer, SnapshotSerializer, PresetSerializer


class IsOwnerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return obj.is_public or obj.user == request.user
        return obj.user == request.user


class PresetViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve simulation presets."""
    queryset = Preset.objects.all()
    serializer_class = PresetSerializer
    permission_classes = [permissions.AllowAny]


class SimulationViewSet(viewsets.ModelViewSet):
    """CRUD API for user simulations."""
    serializer_class = SimulationSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated:
            return Simulation.objects.filter(user=user)
        return Simulation.objects.none()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def snapshot(self, request, pk=None):
        simulation = self.get_object()
        serializer = SnapshotSerializer(data={
            'simulation': simulation.pk,
            'state': request.data.get('state', simulation.state),
            'sim_time': request.data.get('sim_time', 0),
        })
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def snapshots(self, request, pk=None):
        simulation = self.get_object()
        snapshots = simulation.snapshots.all()
        serializer = SnapshotSerializer(snapshots, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def toggle_public(self, request, pk=None):
        simulation = self.get_object()
        simulation.is_public = not simulation.is_public
        simulation.save(update_fields=['is_public'])
        return Response({
            'is_public': simulation.is_public,
            'share_url': request.build_absolute_uri(f'/simulate/{simulation.share_token}/')
            if simulation.is_public else None,
        })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def shared_simulation(request, share_token):
    """Retrieve a simulation by its share token."""
    simulation = get_object_or_404(Simulation, share_token=share_token, is_public=True)
    serializer = SimulationSerializer(simulation, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def current_user(request):
    """Return current user info."""
    if request.user.is_authenticated:
        return Response({
            'authenticated': True,
            'username': request.user.username,
            'email': request.user.email,
        })
    return Response({'authenticated': False})
