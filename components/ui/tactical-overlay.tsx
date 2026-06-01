"use client";

import { useEffect } from "react";
import { useMap } from "@/components/ui/map";
import { calculateParabolicArc, generateRadarPulse } from "./threat-geometry";

export function TacticalOverlay({ incidents }: { incidents: any[] }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    // We will collect arcs and pulses from active critical/elevated incidents
    const arcs: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const pulses: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    incidents.forEach((incident, index) => {
      if (incident.lat && incident.lng && incident.severity >= 0.5) {
        // Create radar pulse
        const pulseCoords = generateRadarPulse(incident.lng, incident.lat, incident.severity * 500);
        pulses.push({
          type: "Feature",
          properties: { id: incident.id, severity: incident.severity },
          geometry: { type: "LineString", coordinates: pulseCoords }
        });

        // Deterministic arc origin derived from incident.id character codes
        // — stable across re-renders, no random jitter
        const idHash = incident.id
          ? (incident.id as string).split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0)
          : index;
        const startLng = incident.lng + 10 * ((idHash % 2 === 0) ? 1 : -1);
        const startLat = incident.lat + 10 * (((idHash >> 1) % 2 === 0) ? 1 : -1);
        
        const arcCoords = calculateParabolicArc(startLng, startLat, incident.lng, incident.lat, incident.severity);
        arcs.push({
          type: "Feature",
          properties: { id: incident.id, severity: incident.severity },
          geometry: { type: "LineString", coordinates: arcCoords }
        });
      }
    });

    const arcSourceId = "tactical-arcs";
    const pulseSourceId = "tactical-pulses";

    if (!map.getSource(arcSourceId)) {
      map.addSource(arcSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: arcs }
      });
    } else {
      (map.getSource(arcSourceId) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: arcs });
    }

    if (!map.getSource(pulseSourceId)) {
      map.addSource(pulseSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: pulses }
      });
    } else {
      (map.getSource(pulseSourceId) as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: pulses });
    }

    if (!map.getLayer("tactical-arcs-layer")) {
      map.addLayer({
        id: "tactical-arcs-layer",
        type: "line",
        source: arcSourceId,
        paint: {
          "line-color": ["interpolate", ["linear"], ["get", "severity"], 0.5, "#ffcc00", 0.8, "#ff0055"],
          "line-width": 2,
          "line-opacity": 0.7,
          "line-dasharray": [2, 2]
        }
      });
    }

    if (!map.getLayer("tactical-pulses-layer")) {
      map.addLayer({
        id: "tactical-pulses-layer",
        type: "line",
        source: pulseSourceId,
        paint: {
          "line-color": ["interpolate", ["linear"], ["get", "severity"], 0.5, "#ffcc00", 0.8, "#ff0055"],
          "line-width": 1,
          "line-opacity": 0.5
        }
      });
    }

    return () => {
      if (map) {
        if (map.getLayer("tactical-arcs-layer")) map.removeLayer("tactical-arcs-layer");
        if (map.getLayer("tactical-pulses-layer")) map.removeLayer("tactical-pulses-layer");
        if (map.getSource(arcSourceId)) map.removeSource(arcSourceId);
        if (map.getSource(pulseSourceId)) map.removeSource(pulseSourceId);
      }
    };

  }, [map, isLoaded, incidents]);

  return null;
}
