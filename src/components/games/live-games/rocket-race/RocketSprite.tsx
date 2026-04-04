import { useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import * as THREE from "three";

// Import rocket images - 3 different designs for 3 lanes
import rocketBlueImg from "@/assets/rockets/rocket-blue.png";      // Traditional rocket for RED lane
import rocketGreenImg from "@/assets/rockets/rocket-green.png";    // UFO for BLUE lane
import rocketOrangeImg from "@/assets/rockets/rocket-orange.png";  // Orange UFO for GREEN lane

interface RocketSpriteProps {
  rocketType: 'red' | 'blue' | 'green';
  position: [number, number, number];
  isLaunching: boolean;
  isWinner: boolean;
  onClick?: () => void;
}

// Map rocket types to their images
const ROCKET_IMAGES: Record<string, string> = {
  red: rocketBlueImg,     // Traditional rocket
  blue: rocketGreenImg,   // UFO spaceship
  green: rocketOrangeImg, // Orange UFO
};

export function RocketSprite({ 
  rocketType,
  position, 
  isLaunching, 
  isWinner,
  onClick 
}: RocketSpriteProps) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const groupRef = useRef<THREE.Group>(null);
  
  // Load texture
  const texture = useLoader(TextureLoader, ROCKET_IMAGES[rocketType]);
  
  // Store current smoothed position
  const smoothPositionRef = useRef({
    x: position[0],
    y: position[1],
    z: position[2]
  });

  useFrame((state) => {
    if (!groupRef.current || !spriteRef.current) return;

    // Smooth position interpolation (lerp)
    const lerpFactor = 0.08;
    smoothPositionRef.current.x += (position[0] - smoothPositionRef.current.x) * lerpFactor;
    smoothPositionRef.current.y += (position[1] - smoothPositionRef.current.y) * lerpFactor;
    smoothPositionRef.current.z += (position[2] - smoothPositionRef.current.z) * lerpFactor;
    
    // Apply smoothed position
    groupRef.current.position.x = smoothPositionRef.current.x;
    groupRef.current.position.y = smoothPositionRef.current.y;
    groupRef.current.position.z = smoothPositionRef.current.z;

    // Gentle sway when launching
    if (isLaunching) {
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 12) * 0.03;
    } else if (isWinner) {
      // Winner celebration - gentle pulse
      const scale = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.1;
      spriteRef.current.scale.set(1.2 * scale, 2.4 * scale, 1);
    } else {
      groupRef.current.rotation.z = 0;
    }
  });

  return (
    <group 
      ref={groupRef}
      position={[smoothPositionRef.current.x, smoothPositionRef.current.y, smoothPositionRef.current.z]}
      onClick={onClick}
    >
      {/* Rocket Sprite */}
      <sprite ref={spriteRef} scale={[1.2, 2.4, 1]}>
        <spriteMaterial 
          map={texture} 
          transparent={true}
          depthWrite={false}
        />
      </sprite>

      {/* Winner Glow Effect */}
      {isWinner && (
        <pointLight 
          position={[0, 0, 1]} 
          color="#ffd700" 
          intensity={3} 
          distance={3}
        />
      )}

      {/* Engine Glow when Launching */}
      {isLaunching && (
        <pointLight 
          position={[0, -1.2, 0.5]} 
          color="#ff6b00" 
          intensity={2} 
          distance={2}
        />
      )}
    </group>
  );
}
