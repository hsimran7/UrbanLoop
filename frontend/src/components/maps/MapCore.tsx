import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

// Fix Leaflet default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface MapMarkerProps {
  id: string;
  position: [number, number];
  icon?: L.Icon | L.DivIcon;
  popupContent?: React.ReactNode | string;
}

export interface MapProps {
  center?: [number, number];
  zoom?: number;
  bounds?: [number, number][];
  markers?: MapMarkerProps[];
  clusters?: boolean;
  heatmap?: [number, number, number][];
  heatmapOptions?: any;
  polylines?: { positions: [number, number][]; color?: string; weight?: number }[];
  polygons?: { positions: [number, number][]; color?: string; fillColor?: string }[];
  circles?: { center: [number, number]; radius: number; color?: string; fillColor?: string; popup?: React.ReactNode | string }[];
  circleMarkers?: { center: [number, number]; radius: number; color?: string; fillColor?: string; popup?: React.ReactNode | string }[];
  onMapClick?: (latlng: { lat: number; lng: number }) => void;
  className?: string;
  tileLayerUrl?: string;
}

const MapCore: React.FC<MapProps> = ({
  center = [30.900965, 75.857277],
  zoom = 12,
  bounds,
  markers = [],
  heatmap,
  heatmapOptions,
  polylines = [],
  polygons = [],
  circles = [],
  circleMarkers = [],
  onMapClick,
  className = "w-full h-full min-h-[400px] rounded-xl z-0",
  tileLayerUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      scrollWheelZoom: true,
    });

    L.tileLayer(tileLayerUrl, {
      attribution: '&copy; <a href="https://carto.com/">CartoDB</a> &copy; OpenStreetMap',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Layers & Event Listeners
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // Set center & zoom
    map.setView(center, zoom);

    // Fit bounds if provided
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [50, 50] });
    }

    // Map Click Listener
    const clickHandler = (e: L.LeafletMouseEvent) => {
      if (onMapClick) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.off('click');
    if (onMapClick) {
      map.on('click', clickHandler);
    }

    // Markers
    markers.forEach(m => {
      const markerOptions = m.icon ? { icon: m.icon } : {};
      const marker = L.marker(m.position, markerOptions);
      if (m.popupContent) {
        if (typeof m.popupContent === 'string') {
          marker.bindPopup(m.popupContent);
        } else {
          const div = document.createElement('div');
          marker.bindPopup(div);
        }
      }
      marker.addTo(layerGroup);
    });

    // Heatmap
    if (heatmap && heatmap.length > 0) {
      const heat = (L as any).heatLayer(heatmap, heatmapOptions || { radius: 20, blur: 15, maxZoom: 17 });
      heat.addTo(layerGroup);
    }

    // Polylines
    polylines.forEach(p => {
      L.polyline(p.positions, { color: p.color || '#3b82f6', weight: p.weight || 3 }).addTo(layerGroup);
    });

    // Polygons
    polygons.forEach(p => {
      L.polygon(p.positions, { color: p.color || '#10b981', fillColor: p.fillColor || p.color }).addTo(layerGroup);
    });

    // Circles
    circles.forEach(c => {
      const circle = L.circle(c.center, { radius: c.radius, color: c.color || '#f43f5e', fillColor: c.fillColor || c.color });
      if (c.popup && typeof c.popup === 'string') circle.bindPopup(c.popup);
      circle.addTo(layerGroup);
    });

    // Circle Markers
    circleMarkers.forEach(c => {
      const cm = L.circleMarker(c.center, { radius: c.radius, color: c.color || '#8b5cf6', fillColor: c.fillColor || c.color });
      if (c.popup && typeof c.popup === 'string') cm.bindPopup(c.popup);
      cm.addTo(layerGroup);
    });

  }, [center, zoom, bounds, markers, heatmap, heatmapOptions, polylines, polygons, circles, circleMarkers, onMapClick]);

  return (
    <div className={className} style={{ isolation: 'isolate' }}>
      <div ref={mapContainerRef} className="w-full h-full min-h-[400px] z-0 rounded-xl" style={{ background: '#0f172a' }} />
    </div>
  );
};

export default MapCore;
