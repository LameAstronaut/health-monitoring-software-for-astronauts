import { useMemo, useState } from "react";

// Ellipsoid meshes projected from three-dimensional coordinates into scalable SVG.
// A schematic navigation model, not an anatomical reconstruction.
const SEGMENTS: [string, number, number, number, number, number][] = [
  ["head", 0, -185, 30, 39, 29],
  ["chest", 0, -95, 58, 65, 30],
  ["abdomen", 0, -5, 46, 49, 28],
  ["arms", -74, -65, 19, 61, 19],
  ["arms", 74, -65, 19, 61, 19],
  ["arms", -88, 23, 14, 43, 14],
  ["arms", 88, 23, 14, 43, 14],
  ["legs", -27, 87, 24, 67, 24],
  ["legs", 27, 87, 24, 67, 24],
  ["legs", -29, 181, 17, 48, 17],
  ["legs", 29, 181, 17, 48, 17],
];
export function BodyModel({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [angle, setAngle] = useState(0);
  const faces = useMemo(() => {
    const a = (angle * Math.PI) / 180;
    const point = (x: number, y: number, z: number) => {
      const depth = z * Math.cos(a) - x * Math.sin(a);
      const scale = 700 / (700 - depth);
      return [
        (x * Math.cos(a) + z * Math.sin(a)) * scale + 180,
        y * scale + 250,
        depth,
      ];
    };
    return SEGMENTS.flatMap(([id, cx, cy, rx, ry, rz], segment) => {
      const points = (lat: number, lon: number) => {
        const t = (lat * Math.PI) / 14,
          p = (lon * 2 * Math.PI) / 20;
        return point(
          cx + rx * Math.sin(t) * Math.cos(p),
          cy + ry * Math.cos(t),
          rz * Math.sin(t) * Math.sin(p),
        );
      };
      return Array.from({ length: 280 }, (_, index) => {
        const lat = Math.floor(index / 20),
          lon = index % 20;
        const vertices = [
          points(lat, lon),
          points(lat + 1, lon),
          points(lat + 1, lon + 1),
          points(lat, lon + 1),
        ];
        const depth = vertices.reduce((sum, p) => sum + p[2], 0) / 4;
        return {
          id,
          key: `${segment}-${index}`,
          depth,
          points: vertices.map((p) => `${p[0]},${p[1]}`).join(" "),
          light: Math.max(24, Math.min(80, 48 + depth * 0.5)),
        };
      });
    }).sort((a, b) => a.depth - b.depth);
  }, [angle]);
  return (
    <div className="body-model">
      <svg
        viewBox="0 0 360 520"
        aria-label="Rotatable three-dimensional body schematic"
      >
        <ellipse cx="180" cy="495" rx="85" ry="9" fill="#bccdd5" />
        {faces.map((face) => (
          <polygon
            key={face.key}
            points={face.points}
            onClick={() => onSelect(face.id)}
            fill={`hsl(${selected === face.id ? 185 : 207} ${selected === face.id ? 50 : 15}% ${face.light}%)`}
          />
        ))}
      </svg>
      <label className="field">
        Rotate body · {angle}°
        <input
          aria-label="Rotate body"
          type="range"
          min="-180"
          max="180"
          step="5"
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value))}
        />
      </label>
      <p className="caption">
        3D schematic · select regions using the buttons below
      </p>
    </div>
  );
}
