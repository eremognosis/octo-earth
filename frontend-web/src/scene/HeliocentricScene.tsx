import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { Line, OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ScaleData } from "../components/DualScaleHUD";

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
  onScaleChange?: (scale: ScaleData) => void;
}

const BODY_META: { name: string; color: string; radius: number; texture: string }[] = [
  { name: "Mercury", color: "#a8a8a8", radius: 0.25, texture: "/textures/planets/mercury.jpg" },
  { name: "Venus", color: "#e6c280", radius: 0.35, texture: "/textures/planets/venus.jpg" },
  { name: "Earth", color: "#3b82f6", radius: 0.40, texture: "/textures/planets/earth-day.jpg" },
  { name: "Mars", color: "#ef4444", radius: 0.30, texture: "/textures/planets/mars.jpg" },
  { name: "Jupiter", color: "#d97706", radius: 1.10, texture: "/textures/planets/jupiter.jpg" },
  { name: "Saturn", color: "#eab308", radius: 0.95, texture: "/textures/planets/saturn.jpg" },
  { name: "Uranus", color: "#38bdf8", radius: 0.70, texture: "/textures/planets/uranus.jpg" },
  { name: "Neptune", color: "#6366f1", radius: 0.70, texture: "/textures/planets/neptune.jpg" },
  { name: "Sun", color: "#facc15", radius: 2.00, texture: "/textures/planets/sun.jpg" },
  { name: "Moon", color: "#e5e7eb", radius: 0.09, texture: "/textures/planets/moon.jpg" },
];

const TEXTURE_URLS = [
  ...BODY_META.map((body) => body.texture),
  "/textures/planets/earth-clouds.jpg",
  "/textures/planets/venus-atmosphere.jpg",
  "/textures/planets/saturn-rings.png",
  "/textures/planets/earth-night.jpg",
];

const EARTH_DISPLAY_RADIUS = BODY_META[2].radius;
const EARTH_PHYSICAL_RADIUS_KM = 6378.137;
const STRUCTURE_SCALE = EARTH_DISPLAY_RADIUS / EARTH_PHYSICAL_RADIUS_KM;
const RING_RADIUS = 7000 * STRUCTURE_SCALE;
const ARM_LENGTH = (72000 - 7000) * STRUCTURE_SCALE;
const ARM_SEGMENT_COUNT = 24;
const ARM_SEGMENT_LENGTH = ARM_LENGTH / ARM_SEGMENT_COUNT;
const ARM_RADIUS = 0.012;
const MOON_ORBIT_RADIUS = EARTH_DISPLAY_RADIUS * 13;
const MOON_SIDEREAL_PERIOD_YEARS = 27.322 / 365.25; // ~0.0748 years per lunar orbit (~13.37 orbits/year)

function ArticulatedArm({ phase }: { phase: number }) {
  const segments = useRef<(THREE.Group | null)[]>([]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    segments.current.forEach((segment, index) => {
      if (!segment) return;
      const wave = time * 0.65 + index * 0.32 + phase;
      segment.rotation.z = Math.sin(wave) * 0.009;
      segment.rotation.y = Math.sin(wave * 0.8) * 0.018;
    });
  });

  const renderSegment = (index: number): React.ReactNode => (
    <group
      ref={(node) => {
        segments.current[index] = node;
      }}
      position={index === 0 ? [0, 0, 0] : [ARM_SEGMENT_LENGTH, 0, 0]}
    >
      <mesh position={[ARM_SEGMENT_LENGTH * 0.43, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry
          args={[
            ARM_RADIUS * (index === ARM_SEGMENT_COUNT - 1 ? 0.55 : 0.82),
            ARM_RADIUS,
            ARM_SEGMENT_LENGTH * 0.78,
            10,
          ]}
        />
        <meshStandardMaterial
          color={index % 3 === 0 ? "#aeb9c5" : "#647487"}
          metalness={0.82}
          roughness={0.34}
        />
      </mesh>
      <mesh position={[ARM_SEGMENT_LENGTH * 0.43, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[ARM_RADIUS * 0.3, ARM_RADIUS * 0.3, ARM_SEGMENT_LENGTH * 0.9, 8]} />
        <meshStandardMaterial color="#d4a84f" metalness={0.78} roughness={0.28} />
      </mesh>
      <mesh position={[ARM_SEGMENT_LENGTH, 0, 0]}>
        <sphereGeometry args={[ARM_RADIUS * 1.12, 12, 10]} />
        <meshStandardMaterial color="#c3ced7" metalness={0.84} roughness={0.28} />
      </mesh>
      <mesh
        position={[ARM_SEGMENT_LENGTH * 0.12, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <torusGeometry args={[ARM_RADIUS * 1.05, ARM_RADIUS * 0.2, 6, 12]} />
        <meshStandardMaterial color="#d6ad59" metalness={0.82} roughness={0.3} />
      </mesh>
      {index + 1 < ARM_SEGMENT_COUNT && renderSegment(index + 1)}
    </group>
  );

  return (
    <group>{renderSegment(0)}</group>
  );
}

function EarthRingStructure({
  earthMeshRef,
}: {
  earthMeshRef: React.MutableRefObject<(THREE.Mesh | null)[]>;
}) {
  const structure = useRef<THREE.Group>(null);
  useFrame(() => {
    const earth = earthMeshRef.current[2];
    if (earth && structure.current) structure.current.position.copy(earth.position);
  });

  return (
    <group ref={structure} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[RING_RADIUS, 0.018, 12, 256]} />
        <meshStandardMaterial color="#8293a3" metalness={0.84} roughness={0.32} />
      </mesh>
      <mesh>
        <torusGeometry args={[RING_RADIUS, 0.006, 8, 256]} />
        <meshStandardMaterial color="#dbb45d" metalness={0.86} roughness={0.28} />
      </mesh>

      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index * Math.PI) / 4;
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        return (
          <group
            key={index}
            position={[x * RING_RADIUS, y * RING_RADIUS, 0]}
            rotation={[0, 0, angle]}
          >
            <mesh position={[-RING_RADIUS * 0.055, 0, 0]}>
              <cylinderGeometry args={[0.015, 0.021, RING_RADIUS * 0.11, 12]} />
              <meshStandardMaterial color="#68798a" metalness={0.86} roughness={0.34} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.033, 16, 12]} />
              <meshStandardMaterial color="#d2ae64" metalness={0.82} roughness={0.27} />
            </mesh>
            <mesh position={[0.021, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
              <cylinderGeometry args={[0.022, 0.03, 0.052, 12]} />
              <meshStandardMaterial color="#778797" metalness={0.84} roughness={0.32} />
            </mesh>
            <ArticulatedArm phase={index * Math.PI / 4} />
          </group>
        );
      })}
    </group>
  );
}

// Display-only multiplier on orbit radii: widens inter-orbit spacing without touching sim data or timing.
const ORBIT_SPREAD = 1.6;

function simAuToSceneVec(posAu: number[]): [number, number, number] {
  const [x, y, z] = posAu;
  const r = Math.hypot(x, y, z);
  if (r < 1e-9) return [0, 0, 0];
  const scale = (10 * ORBIT_SPREAD * Math.sqrt(r)) / r;
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
  onScaleChange,
}: HeliocentricSceneProps) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const failurePulse = useRef<THREE.Mesh | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const moonOrbitRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastReportedIntFrame = useRef<number>(-1);
  const lastDistRef = useRef<number>(-1);
  const lastHeightRef = useRef<number>(-1);
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;
  const { camera, size } = useThree();
  const textures = useLoader(THREE.TextureLoader, TEXTURE_URLS);
  const [earthClouds, venusAtmosphere, saturnRings, earthNight] = textures.slice(BODY_META.length);
  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
    });
    earthClouds.colorSpace = THREE.NoColorSpace;
    saturnRings.colorSpace = THREE.NoColorSpace;
    saturnRings.center.set(0.5, 0.5);
    saturnRings.rotation = Math.PI / 2;
    textures.forEach((texture) => {
      texture.needsUpdate = true;
    });
  }, [earthClouds, saturnRings, textures]);
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

  useFrame(({ clock }, dt) => {
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
    const failed = frames[i0].status !== 0;
    if (failurePulse.current) {
      const pulse = failed ? 1 + 0.18 * Math.sin(performance.now() * 0.008) : 0;
      failurePulse.current.scale.setScalar(pulse);
      failurePulse.current.visible = failed;
    }

    for (let b = 0; b < BODY_META.length; b++) {
      const mesh = meshRefs.current[b];
      const trail = bodyPositions[b];
      if (!mesh || !trail || trail.length === 0) continue;

      if (b === 9) {
        const earth = meshRefs.current[2];
        if (earth) {
          // Drive phase from tRef (always-fresh ref) + framesRef — no stale closures
          const totalFrames = framesRef.current.length;
          const totalYears = framesRef.current[totalFrames - 1]?.time ?? 1;
          const framesPerMoonOrbit = (MOON_SIDEREAL_PERIOD_YEARS / totalYears) * totalFrames;
          const phase = (tRef.current / framesPerMoonOrbit) * Math.PI * 2;
          const inclination = Math.sin(phase * 0.0748) * MOON_ORBIT_RADIUS * 0.12;
          mesh.position.set(
            earth.position.x + Math.cos(phase) * MOON_ORBIT_RADIUS,
            earth.position.y + inclination,
            earth.position.z + Math.sin(phase) * MOON_ORBIT_RADIUS
          );
          moonOrbitRef.current?.position.copy(earth.position);
          mesh.rotation.y = phase;
          continue;
        }
      }

      const p0 = trail[i0];
      const p1 = trail[i1];

      mesh.rotation.y += dt * (b === 8 ? 0.08 : b === 2 ? 0.35 : 0.16);
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

    // Dynamic zoom-based dual scale calculation
    if (onScaleChangeRef.current) {
      const target = controls?.target ?? new THREE.Vector3(0, 0, 0);
      const dist = camera.position.distanceTo(target);
      const canvasHeight = size.height > 0 ? size.height : 900;
      if (
        Math.abs(dist - lastDistRef.current) > 0.01 ||
        Math.abs(canvasHeight - lastHeightRef.current) > 2
      ) {
        lastDistRef.current = dist;
        lastHeightRef.current = canvasHeight;

        const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
        const visibleHeight = 2 * dist * Math.tan((fov * Math.PI) / 360);
        const sceneUnitsPerPixel = visibleHeight / canvasHeight;

        const barPx = 100;
        const barSceneUnits = barPx * sceneUnitsPerPixel;
        const orbitAu = (barSceneUnits * 0.1) / ORBIT_SPREAD;
        const orbitKm = orbitAu * 149597870.7;
        const planetKm = barSceneUnits * 15945.3425;
        const planetAu = planetKm / 149597870.7;
        const ratio = 938.192;
        const zoomFactor = 72.11 / (dist > 0.001 ? dist : 0.001);

        onScaleChangeRef.current({
          orbitAu,
          orbitKm,
          planetKm,
          planetAu,
          ratio,
          cameraDistance: dist,
          zoomFactor,
          barWidthPx: barPx,
        });
      }
    }

    if (i0 !== lastReportedIntFrame.current) {
      lastReportedIntFrame.current = i0;
      onFrame(i0);
    }
  });

  if (frames.length === 0) return null;

  return (
    <group>
      <ambientLight intensity={0.28} />
      <pointLight position={[0, 0, 0]} intensity={25} color="#fff4cf" />
      <directionalLight position={[20, 30, 40]} intensity={0.55} color="#d7eaff" />
      <mesh ref={failurePulse} visible={false}>
        <sphereGeometry args={[3.2, 20, 20]} />
        <meshBasicMaterial color="#ff315d" transparent opacity={0.2} blending={THREE.AdditiveBlending} />
      </mesh>
      <OrbitControls ref={controlsRef} makeDefault />
      <gridHelper args={[120 * ORBIT_SPREAD, 24,"#334155", "#1e293b"]} />
      <group ref={moonOrbitRef} rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <torusGeometry args={[MOON_ORBIT_RADIUS, 0.006, 8, 160]} />
          <meshBasicMaterial color="#a9bdce" transparent opacity={0.28} />
        </mesh>
      </group>

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
          <sphereGeometry args={[body.radius, 64, 64]} />
          {body.name === "Sun" ? (
            <>
              <meshBasicMaterial map={textures[b]} toneMapped={false} />
              <mesh scale={1.15}>
                <sphereGeometry args={[body.radius, 64, 64]} />
                <meshBasicMaterial
                  color="#ff8a24"
                  transparent
                  opacity={0.12}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </mesh>
            </>
          ) : (
            <meshStandardMaterial
              map={textures[b]}
              roughness={body.name === "Earth" ? 0.68 : 0.92}
              emissive={body.name === "Earth" ? "#fff" : "#000"}
              emissiveMap={body.name === "Earth" ? earthNight : undefined}
              emissiveIntensity={body.name === "Earth" ? 0.2 : 1}
              metalness={0}
            />
          )}
          {body.name === "Earth" && (
            <mesh scale={1.06}>
              <sphereGeometry args={[body.radius, 64, 64]} />
              <meshBasicMaterial
                color="#ffffff"
                alphaMap={earthClouds}
                transparent
                opacity={0.68}
                depthWrite={false}
              />
            </mesh>
          )}
          {body.name === "Venus" && (
            <mesh scale={1.012}>
              <sphereGeometry args={[body.radius, 64, 64]} />
              <meshStandardMaterial
                map={venusAtmosphere}
                color="#fff2d4"
                roughness={1}
                transparent
                opacity={0.3}
                depthWrite={false}
              />
            </mesh>
          )}
          {body.name === "Saturn" && (
            <mesh rotation={[Math.PI / 2 + 0.12, 0, 0]}>
              <ringGeometry args={[1.05, 2.18, 256]} />
              <meshStandardMaterial
                map={saturnRings}
                alphaMap={saturnRings}
                color="#d7c59e"
                roughness={0.95}
                metalness={0}
                side={THREE.DoubleSide}
                transparent
                opacity={0.92}
                depthWrite={false}
              />
            </mesh>
          )}
          {/* Planet / body label */}
          <Html
            position={[0, body.radius * 2.0 + 0.06, 0]}
            center
            distanceFactor={18}
            zIndexRange={[100, 0]}
            style={{
              pointerEvents: "none",
              userSelect: "none",
              whiteSpace: "nowrap",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontSize: "11px",
              fontWeight: "600",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: body.name === "Sun" ? "#fde68a"
                : body.name === "Moon" ? "#cbd5e1"
                : body.name === "Earth" ? "#93c5fd"
                : body.name === "Mars" ? "#fca5a5"
                : body.name === "Venus" ? "#fde68a"
                : body.name === "Jupiter" ? "#fdba74"
                : body.name === "Saturn" ? "#fef08a"
                : body.name === "Uranus" ? "#7dd3fc"
                : body.name === "Neptune" ? "#a5b4fc"
                : "#94a3b8",
              padding: "2px 7px",
              background: "rgba(2, 8, 18, 0.55)",
              borderRadius: "4px",
              border: "1px solid rgba(148, 163, 184, 0.15)",
              backdropFilter: "blur(4px)",
              lineHeight: "1.4",
            }}
          >
            {body.name}
          </Html>
        </mesh>
      ))}
      <EarthRingStructure earthMeshRef={meshRefs} />
    </group>
  );
}







