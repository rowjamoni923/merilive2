import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Trail } from "@react-three/drei";
import * as THREE from "three";

interface Rocket3DProps {
  color: string;
  secondaryColor: string;
  position: [number, number, number];
  isLaunching: boolean;
  isWinner: boolean;
  onClick?: () => void;
}

export function Rocket3D({ 
  color, 
  secondaryColor, 
  position, 
  isLaunching, 
  isWinner,
  onClick 
}: Rocket3DProps) {
  const rocketRef = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.Mesh>(null);
  const innerFlameRef = useRef<THREE.Mesh>(null);
  
  // Store current smoothed position
  const smoothPositionRef = useRef({
    x: position[0],
    y: position[1],
    z: position[2]
  });

  useFrame((state, delta) => {
    if (!rocketRef.current) return;

    // Smooth position interpolation (lerp) - very smooth movement
    const lerpFactor = 0.08; // Lower = smoother, higher = faster response
    smoothPositionRef.current.x += (position[0] - smoothPositionRef.current.x) * lerpFactor;
    smoothPositionRef.current.y += (position[1] - smoothPositionRef.current.y) * lerpFactor;
    smoothPositionRef.current.z += (position[2] - smoothPositionRef.current.z) * lerpFactor;
    
    // Apply smoothed position
    rocketRef.current.position.x = smoothPositionRef.current.x;
    rocketRef.current.position.y = smoothPositionRef.current.y;
    rocketRef.current.position.z = smoothPositionRef.current.z;

    // Gentle sway when launching (subtle vibration)
    if (isLaunching) {
      rocketRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 15) * 0.02;
    } else if (isWinner) {
      // Winner celebration rotation
      rocketRef.current.rotation.y += delta * 2;
      rocketRef.current.rotation.z = 0;
    } else {
      rocketRef.current.rotation.z = 0;
    }

    // Flame animation
    if (flameRef.current && innerFlameRef.current) {
      const flameScale = isLaunching 
        ? 1 + Math.sin(state.clock.elapsedTime * 20) * 0.4
        : 0.3 + Math.sin(state.clock.elapsedTime * 5) * 0.1;
      
      flameRef.current.scale.y = flameScale;
      innerFlameRef.current.scale.y = flameScale * 0.8;
    }
  });

  return (
    <group 
      ref={rocketRef} 
      position={[smoothPositionRef.current.x, smoothPositionRef.current.y, smoothPositionRef.current.z]}
      onClick={onClick}
    >
      {/* Rocket Trail */}
      {isLaunching && (
        <Trail
          width={0.5}
          length={6}
          color={new THREE.Color(color)}
          attenuation={(t) => t * t}
        >
          <mesh position={[0, -0.8, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </Trail>
      )}

      {/* Main Body - Cylindrical Fuselage */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 1.2, 16]} />
        <meshStandardMaterial 
          color={color} 
          metalness={0.8} 
          roughness={0.2}
        />
      </mesh>

      {/* Body Details - Rings */}
      {[0.2, -0.1, -0.4].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <torusGeometry args={[0.16, 0.015, 8, 24]} />
          <meshStandardMaterial 
            color={secondaryColor} 
            metalness={0.9} 
            roughness={0.1} 
          />
        </mesh>
      ))}

      {/* Nose Cone */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <coneGeometry args={[0.15, 0.5, 16]} />
        <meshStandardMaterial 
          color={secondaryColor} 
          metalness={0.9} 
          roughness={0.1}
        />
      </mesh>

      {/* Nose Tip */}
      <mesh position={[0, 1.15, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial 
          color="#ffffff" 
          metalness={1} 
          roughness={0}
          emissive="#ffffff"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Window/Porthole */}
      <mesh position={[0, 0.25, 0.14]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial 
          color="#87CEEB" 
          metalness={0.3} 
          roughness={0.1}
          emissive="#4fc3f7"
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh position={[0, 0.25, 0.12]}>
        <ringGeometry args={[0.075, 0.09, 16]} />
        <meshStandardMaterial color={secondaryColor} metalness={0.9} />
      </mesh>

      {/* Fins - 4 Around the Base */}
      {[0, 90, 180, 270].map((angle, i) => (
        <group key={i} rotation={[0, (angle * Math.PI) / 180, 0]}>
          <mesh position={[0.2, -0.55, 0]} rotation={[0, 0, -0.3]} castShadow>
            <boxGeometry args={[0.15, 0.35, 0.03]} />
            <meshStandardMaterial 
              color={color} 
              metalness={0.7} 
              roughness={0.3}
            />
          </mesh>
          {/* Fin Edge Highlight */}
          <mesh position={[0.27, -0.55, 0]} rotation={[0, 0, -0.3]}>
            <boxGeometry args={[0.02, 0.35, 0.035]} />
            <meshStandardMaterial 
              color={secondaryColor} 
              metalness={0.9} 
              roughness={0.1}
            />
          </mesh>
        </group>
      ))}

      {/* Engine Nozzle */}
      <mesh position={[0, -0.7, 0]}>
        <cylinderGeometry args={[0.12, 0.08, 0.15, 16]} />
        <meshStandardMaterial 
          color="#333333" 
          metalness={0.9} 
          roughness={0.2}
        />
      </mesh>

      {/* Inner Nozzle */}
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 0.12, 16]} />
        <meshStandardMaterial 
          color="#111111" 
          metalness={0.5} 
          roughness={0.5}
        />
      </mesh>

      {/* Outer Flame */}
      <mesh ref={flameRef} position={[0, -0.95, 0]}>
        <coneGeometry args={[0.12, 0.6, 16]} />
        <MeshDistortMaterial 
          color="#ff6b00"
          emissive="#ff4500"
          emissiveIntensity={2}
          transparent
          opacity={isLaunching ? 0.9 : 0.4}
          distort={0.4}
          speed={10}
        />
      </mesh>

      {/* Inner Flame - Brighter Core */}
      <mesh ref={innerFlameRef} position={[0, -0.9, 0]}>
        <coneGeometry args={[0.06, 0.4, 16]} />
        <MeshDistortMaterial 
          color="#ffff00"
          emissive="#ffffff"
          emissiveIntensity={3}
          transparent
          opacity={isLaunching ? 1 : 0.5}
          distort={0.3}
          speed={15}
        />
      </mesh>

      {/* Winner Glow Effect */}
      {isWinner && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.8, 16, 16]} />
          <meshBasicMaterial 
            color={color}
            transparent
            opacity={0.2}
          />
        </mesh>
      )}

      {/* Rocket Body Glow when Launching */}
      {isLaunching && (
        <pointLight 
          position={[0, -0.8, 0]} 
          color="#ff6b00" 
          intensity={3} 
          distance={2}
        />
      )}
    </group>
  );
}
