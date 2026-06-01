export type ThreatTrajectory = {
  start: [number, number];
  end: [number, number];
  arcHeight: number;
};

// Converts standard coordinates to a 3D parabolic arc (Missile Trajectory)
export function calculateParabolicArc(
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number,
  severity: number,
  points: number = 50
): [number, number][] {
  const arc: [number, number][] = [];
  const arcHeight = Math.max(0.5, severity * 2); // Max height offset

  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const lng = startLng + (endLng - startLng) * t;
    const lat = startLat + (endLat - startLat) * t;
    
    // Parabola: y = -4h(t^2 - t)
    // We add this to longitude or latitude just for a visual 2D projection arc,
    // though in a real 3D engine it would be the Z axis.
    // Mapbox/MapLibre doesn't support raw 3D lines out of the box without custom layers,
    // so we curve the line horizontally on the 2D map to simulate an arc.
    const curveOffset = -4 * arcHeight * (t * t - t);
    
    // Normal vector perpendicular to the line
    const dx = endLng - startLng;
    const dy = endLat - startLat;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    const nx = -dy / len;
    const ny = dx / len;

    arc.push([lng + nx * curveOffset, lat + ny * curveOffset]);
  }
  
  return arc;
}

export function generateRadarPulse(lng: number, lat: number, radius: number, points: number = 64): [number, number][] {
  const circle: [number, number][] = [];
  const earthRadius = 6371; // km

  for (let i = 0; i <= points; i++) {
    const angle = (i * 360) / points;
    const rad = angle * (Math.PI / 180);
    
    const dLat = (radius / earthRadius) * (180 / Math.PI);
    const dLng = (radius / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
    
    circle.push([lng + dLng * Math.cos(rad), lat + dLat * Math.sin(rad)]);
  }
  
  return circle;
}
