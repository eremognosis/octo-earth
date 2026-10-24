import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type Frame = {
  time: number;
  positions: number[][];
  separation: number;
  minimumSunDistance: number;
  status: number;
};

export interface HeliocentricSceneProps {
  frames: Frame[];
  playing: boolean;
  speed: number;
  followEarth: boolean;
  tRef: React.MutableRefObject<number>;
  onFrame: (frameIndex: number) => void;
  activeFrame: number;
}

const BODY_META = [
  { name: "Mercury", color: "#a8a8a8", radius: 0.25 },
  { name: "Venus", color: "#e6c280", radius: 0.35 },
  { name: "Earth", color: "#3b82f6", radius: 0.40 },
  { name: "Mars", color: "#ef4444", radius: 0.30 },
  { name: "Jupiter", color: "#d97706", radius: 1.10 },
  { name: "Saturn", color: "#eab308", radius: 0.95 },
  { name: "Uranus", color: "#38bdf8", radius: 0.70 },
  { name: "Neptune", color: "#6366f1", radius: 0.70 },
  { name: "Sun", color: "#facc15", radius: 2.00 },
  { name: "Moon", color: "#e5e7eb", radius: 0.15 },
];

function simAuToSceneVec(posAu: number[]): [number, number, number] {
  const [x, y, z] = posAu;
  const r = Math.hypot(x, y, z);
  if (r < 1e-9) return [0, 0, 0];
  const scale = (10 * Math.sqrt(r)) / r;
  return [x * scale, z * scale, y * scale];
}

export function HeliocentricScene({
  frames,
  playing,
  speed,
  followEarth,
  tRef,
  onFrame,
  activeFrame,
}: HeliocentricSceneProps) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastReportedIntFrame = useRef<number>(-1);
  const { camera } = useThree();
  const bodyPositions = useMemo(() => {
    if (frames.length === 0) return [];
    return BODY_META.map((_, bodyIdx) =>
      frames.map((f) => simAuToSceneVec(f.positions[bodyIdx]))
    );
  }, [frames]);

  const recentTrails = useMemo(() => {
    if (frames.length === 0) return [];
    const end = Math.max(0, Math.min(activeFrame, frames.length - 1));

    return BODY_META.map((_, bodyIdx) => {
      if (bodyIdx === 8 || end === 0) return [];

      const points = [bodyPositions[bodyIdx][end]];
      let sweptDegrees = 0;
      let current = end;

      while (current > 0 && sweptDegrees < 345) {
        const previous = current - 1;
        const currentPosition = frames[current].positions[bodyIdx];
        const previousPosition = frames[previous].positions[bodyIdx];
        const currentAngle = Math.atan2(currentPosition[1], currentPosition[0]);
        const previousAngle = Math.atan2(previousPosition[1], previousPosition[0]);
        let delta = currentAngle - previousAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        sweptDegrees += Math.abs(delta * 180 / Math.PI);
        points.unshift(bodyPositions[bodyIdx][previous]);
        current = previous;
      }

      return points;
    });
  }, [bodyPositions, frames, activeFrame]);

  useFrame((_, dt) => {
    const numFrames = frames.length;
    if (numFrames === 0) return;

    if (playing && numFrames > 1) {
      tRef.current += dt * speed;
      if (tRef.current >= numFrames - 1) {
        tRef.current = tRef.current % (numFrames - 1);
      }
    }

    const t = Math.max(0, Math.min(tRef.current, numFrames - 1));
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, numFrames - 1);
    const alpha = t - i0;

    for (let b = 0; b < BODY_META.length; b++) {
      const mesh = meshRefs.current[b];
      const trail = bodyPositions[b];
      if (!mesh || !trail || trail.length === 0) continue;

      const p0 = trail[i0];
      const p1 = trail[i1];

      mesh.position.set(
        p0[0] + (p1[0] - p0[0]) * alpha,
        p0[1] + (p1[1] - p0[1]) * alpha,
        p0[2] + (p1[2] - p0[2]) * alpha
      );
    }

    const controls = controlsRef.current;
    const earthMesh = meshRefs.current[2];
    if (controls && earthMesh) {
      const desiredTarget = followEarth
        ? earthMesh.position
        : new THREE.Vector3(0, 0, 0);
      const delta = desiredTarget.clone().sub(controls.target);
      camera.position.add(delta);
      controls.target.copy(desiredTarget);
      controls.update();
    }

    if (i0 !== lastReportedIntFrame.current) {
      lastReportedIntFrame.current = i0;
      onFrame(i0);
    }
  });

  if (frames.length === 0) return null;

  return (
    <group>
      <ambientLight intensity={1.2} />
      <pointLight position={[0, 0, 0]} intensity={3} color="#fff4cf" />
      <directionalLight position={[20, 30, 40]} intensity={2.5} color="#d7eaff" />
      <OrbitControls ref={controlsRef} makeDefault />
      <gridHelper args={[120, 24, "#334155", "#1e293b"]} />

      {recentTrails.map((points, b) => {
        if (b === 8 || points.length < 2) return null;
        return (
          <Line
            key={`trail-${BODY_META[b].name}`}
            points={points}
            color={BODY_META[b].color}
            lineWidth={b === 2 ? 2.2 : 1.0}
            transparent
            opacity={b === 2 ? 0.9 : 0.4}
          />
        );
      })}

      {BODY_META.map((body, b) => (
        <mesh
          key={body.name}
          ref={(el) => {
            meshRefs.current[b] = el;
          }}
        >
          <sphereGeometry args={[body.radius, 24, 24]} />
          <meshStandardMaterial
            color={body.color}
            roughness={0.78}
            metalness={0.06}
            emissive={body.color}
            emissiveIntensity={b === 8 ? 1.5 : 0.12}
          />
        </mesh>
      ))}
    </group>
  );
}
