import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface LiveGame3DStageProps {
  gameId?: string | null;
  phase?: string;
  intensity?: "idle" | "active" | "win";
}

const cssHsl = (token: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value ? `hsl(${value})` : fallback;
};

function NeonParticles({ active }: { active: boolean }) {
  const points = useRef<THREE.Points>(null);
  const particles = useMemo(() => {
    const positions = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 5;
    }
    return positions;
  }, []);

  useFrame((_, delta) => {
    if (!points.current) return;
    points.current.rotation.y += delta * (active ? 0.18 : 0.05);
    points.current.rotation.x = Math.sin(Date.now() * 0.0003) * 0.08;
  });

  return (
    <points ref={points} position={[0, 0, -1]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particles.length / 3} array={particles} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color={cssHsl("--live-game-neon", "hsl(330, 85%, 55%)")} transparent opacity={0.72} depthWrite={false} />
    </points>
  );
}

function FerrisWheelModel({ active, win }: { active: boolean; win: boolean }) {
  const wheel = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!wheel.current) return;
    wheel.current.rotation.z += delta * (active ? 2.2 : 0.22);
    wheel.current.rotation.y = Math.sin(Date.now() * 0.0005) * 0.12;
  });

  const accent = cssHsl("--live-game-neon", "hsl(330, 85%, 55%)");
  const gold = cssHsl("--live-game-gold", "hsl(45, 93%, 58%)");

  return (
    <group position={[0, 0.1, 0]} rotation={[0.18, 0, 0]}>
      <group ref={wheel}>
        <mesh>
          <torusGeometry args={[1.45, 0.045, 16, 96]} />
          <meshStandardMaterial color={win ? gold : accent} emissive={win ? gold : accent} emissiveIntensity={win ? 1.6 : 0.85} metalness={0.75} roughness={0.18} />
        </mesh>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, 0, angle]}>
              <mesh position={[0, 0.74, 0]}>
                <boxGeometry args={[0.025, 1.42, 0.025]} />
                <meshStandardMaterial color={cssHsl("--live-game-steel", "hsl(230, 22%, 72%)")} metalness={0.8} roughness={0.22} />
              </mesh>
              <Float speed={2} floatIntensity={0.18} rotationIntensity={0.15}>
                <mesh position={[0, 1.45, 0.06]}>
                  <sphereGeometry args={[0.13, 24, 16]} />
                  <meshStandardMaterial color={i % 2 ? gold : accent} emissive={i % 2 ? gold : accent} emissiveIntensity={0.55} metalness={0.35} roughness={0.18} />
                </mesh>
              </Float>
            </group>
          );
        })}
        <mesh>
          <sphereGeometry args={[0.18, 32, 16]} />
          <meshStandardMaterial color={gold} emissive={gold} emissiveIntensity={0.8} metalness={0.9} roughness={0.12} />
        </mesh>
      </group>
      <mesh position={[-0.55, -1.15, -0.05]} rotation={[0, 0, -0.35]}>
        <boxGeometry args={[0.08, 1.55, 0.08]} />
        <meshStandardMaterial color={cssHsl("--live-game-steel", "hsl(230, 22%, 72%)")} metalness={0.75} roughness={0.24} />
      </mesh>
      <mesh position={[0.55, -1.15, -0.05]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[0.08, 1.55, 0.08]} />
        <meshStandardMaterial color={cssHsl("--live-game-steel", "hsl(230, 22%, 72%)")} metalness={0.75} roughness={0.24} />
      </mesh>
    </group>
  );
}

function CasinoTableModel({ active, win }: { active: boolean; win: boolean }) {
  const table = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!table.current) return;
    table.current.rotation.y += delta * (active ? 0.22 : 0.06);
  });

  return (
    <group ref={table} position={[0, -0.25, 0]} rotation={[0.92, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[1.55, 1.7, 0.18, 80]} />
        <meshStandardMaterial color={cssHsl("--live-game-felt", "hsl(158, 70%, 28%)")} emissive={cssHsl("--live-game-felt", "hsl(158, 70%, 28%)")} emissiveIntensity={0.18} roughness={0.34} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <torusGeometry args={[1.58, 0.045, 14, 96]} />
        <meshStandardMaterial color={win ? cssHsl("--live-game-gold", "hsl(45, 93%, 58%)") : cssHsl("--live-game-neon", "hsl(330, 85%, 55%)")} emissive={cssHsl("--live-game-gold", "hsl(45, 93%, 58%)")} emissiveIntensity={win ? 1.1 : 0.35} metalness={0.85} roughness={0.12} />
      </mesh>
      {[-0.75, 0, 0.75].map((x, i) => (
        <Float key={x} speed={2 + i * 0.25} floatIntensity={active ? 0.42 : 0.14} rotationIntensity={0.25}>
          <mesh position={[x, 0.32 + i * 0.02, 0.1]} rotation={[0, 0, (i - 1) * 0.18]}>
            <boxGeometry args={[0.42, 0.04, 0.62]} />
            <meshStandardMaterial color={cssHsl("--live-game-card", "hsl(0, 0%, 96%)")} emissive={cssHsl("--live-game-card", "hsl(0, 0%, 96%)")} emissiveIntensity={0.1} roughness={0.22} />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

function RocketRaceModel({ active, win }: { active: boolean; win: boolean }) {
  const rocket = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!rocket.current) return;
    rocket.current.position.y = Math.sin(state.clock.elapsedTime * 2.4) * 0.12 + (active ? 0.35 : 0);
    rocket.current.rotation.z = Math.sin(state.clock.elapsedTime * 3) * 0.08;
    rocket.current.rotation.y += delta * 0.35;
  });

  return (
    <group ref={rocket} position={[0, -0.2, 0]} rotation={[0.2, 0, -0.45]}>
      <mesh>
        <coneGeometry args={[0.28, 0.72, 32]} />
        <meshStandardMaterial color={cssHsl("--live-game-neon", "hsl(330, 85%, 55%)")} emissive={cssHsl("--live-game-neon", "hsl(330, 85%, 55%)")} emissiveIntensity={0.45} metalness={0.45} roughness={0.16} />
      </mesh>
      <mesh position={[0, -0.58, 0]}>
        <cylinderGeometry args={[0.24, 0.28, 0.82, 32]} />
        <meshStandardMaterial color={cssHsl("--live-game-steel", "hsl(230, 22%, 72%)")} metalness={0.82} roughness={0.18} />
      </mesh>
      <mesh position={[0, -1.12, 0]}>
        <coneGeometry args={[0.24, active ? 0.98 : 0.42, 32]} />
        <meshBasicMaterial color={win ? cssHsl("--live-game-gold", "hsl(45, 93%, 58%)") : cssHsl("--live-game-flame", "hsl(18, 94%, 58%)")} transparent opacity={active ? 0.9 : 0.45} />
      </mesh>
    </group>
  );
}

function Scene({ gameId, phase, intensity }: Required<LiveGame3DStageProps>) {
  const active = phase !== "betting" || intensity === "active" || intensity === "win";
  const win = intensity === "win";
  const normalized = (gameId || "ferris-wheel").replace("_", "-");

  return (
    <>
      <ambientLight intensity={0.72} />
      <pointLight position={[2.8, 2.5, 2.5]} intensity={3.4} color={cssHsl("--live-game-neon", "hsl(330, 85%, 55%)")} />
      <pointLight position={[-2.5, -1.2, 2]} intensity={2.4} color={cssHsl("--live-game-gold", "hsl(45, 93%, 58%)")} />
      <Stars radius={12} depth={4} count={80} factor={1.5} fade speed={active ? 1 : 0.35} />
      <NeonParticles active={active} />
      {normalized.includes("rocket") ? (
        <RocketRaceModel active={active} win={win} />
      ) : normalized.includes("teen-patti") || normalized.includes("roulette") ? (
        <CasinoTableModel active={active} win={win} />
      ) : (
        <FerrisWheelModel active={active} win={win} />
      )}
    </>
  );
}

export function LiveGame3DStage({ gameId = "ferris-wheel", phase = "betting", intensity = "idle" }: LiveGame3DStageProps) {
  return (
    <div className="live-game-3d-stage" aria-hidden="true">
      <Canvas camera={{ position: [0, 0.2, 4.7], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <Scene gameId={gameId || "ferris-wheel"} phase={phase} intensity={intensity} />
      </Canvas>
      <div className="live-game-stage-vignette" />
      <div className="live-game-stage-scanline" />
    </div>
  );
}