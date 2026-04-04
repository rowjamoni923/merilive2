import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface RouletteWheelProps {
  isSpinning: boolean;
  winningNumber: number | null;
}

// European roulette wheel sequence
const WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

export const RouletteWheel = ({ isSpinning, winningNumber }: RouletteWheelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(0);
  const [ballAngle, setBallAngle] = useState(0);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const SEGMENTS = WHEEL_NUMBERS.length;
  const SEGMENT_ANGLE = (2 * Math.PI) / SEGMENTS;

  // Draw wheel on canvas
  const drawWheel = (ctx: CanvasRenderingContext2D, size: number, rot: number) => {
    // Guard against too-small canvas sizes that cause negative radii
    if (size < 30) return;
    
    const cx = size / 2;
    const cy = size / 2;
    const outerR = Math.max(size / 2 - 4, 1);
    const innerR = Math.max(outerR * 0.35, 1);
    const numberR = Math.max(outerR * 0.78, 1);
    const segOuterR = Math.max(outerR * 0.92, 1);
    const segInnerR = Math.max(outerR * 0.55, 1);

    ctx.clearRect(0, 0, size, size);

    // Outer gold ring
    const goldGrad = ctx.createRadialGradient(cx, cy, Math.max(outerR - 12, 0), cx, cy, outerR);
    goldGrad.addColorStop(0, "#DAA520");
    goldGrad.addColorStop(0.3, "#FFD700");
    goldGrad.addColorStop(0.6, "#B8860B");
    goldGrad.addColorStop(1, "#8B6914");
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = goldGrad;
    ctx.fill();

    // Gold ring decorative dots
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const dotX = cx + Math.cos(a) * (outerR - 6);
      const dotY = cy + Math.sin(a) * (outerR - 6);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? "#FFD700" : "#8B6914";
      ctx.fill();
    }

    // Inner gold ring
    ctx.beginPath();
    ctx.arc(cx, cy, segOuterR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw segments
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    for (let i = 0; i < SEGMENTS; i++) {
      const startA = i * SEGMENT_ANGLE - SEGMENT_ANGLE / 2;
      const endA = startA + SEGMENT_ANGLE;
      const num = WHEEL_NUMBERS[i];

      // Segment color
      let color: string;
      if (num === 0) {
        color = "#16a34a";
      } else if (RED_NUMBERS.includes(num)) {
        color = "#dc2626";
      } else {
        color = "#1a1a2e";
      }

      // Draw segment
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, segOuterR, startA, endA);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Segment border
      ctx.strokeStyle = "#DAA52050";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Number text
      const textAngle = startA + SEGMENT_ANGLE / 2;
      ctx.save();
      ctx.rotate(textAngle);
      ctx.translate(numberR, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${Math.floor(size / 28)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(num), 0, 0);
      ctx.restore();
    }

    // Inner number ring border
    ctx.beginPath();
    ctx.arc(0, 0, segInnerR, 0, Math.PI * 2);
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Center wooden pattern
    const woodGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
    woodGrad.addColorStop(0, "#D4A04A");
    woodGrad.addColorStop(0.4, "#B8860B");
    woodGrad.addColorStop(0.7, "#8B6914");
    woodGrad.addColorStop(1, "#6B4E10");
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = woodGrad;
    ctx.fill();

    // Wood grain lines
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * innerR * 0.9, Math.sin(a) * innerR * 0.9);
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // Gold center ring
    ctx.beginPath();
    ctx.arc(cx, cy, innerR * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Center jewel
    const jewelGrad = ctx.createRadialGradient(cx - 3, cy - 3, 0, cx, cy, innerR * 0.3);
    jewelGrad.addColorStop(0, "#FFE680");
    jewelGrad.addColorStop(0.5, "#DAA520");
    jewelGrad.addColorStop(1, "#8B6914");
    ctx.beginPath();
    ctx.arc(cx, cy, innerR * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = jewelGrad;
    ctx.fill();

    // Highlight dot
    ctx.beginPath();
    ctx.arc(cx - innerR * 0.08, cy - innerR * 0.08, innerR * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fill();
  };

  // Draw ball
  const drawBall = (ctx: CanvasRenderingContext2D, size: number, angle: number) => {
    const cx = size / 2;
    const cy = size / 2;
    const ballR = (size / 2 - 4) * 0.95;
    const bx = cx + Math.cos(angle) * ballR;
    const by = cy + Math.sin(angle) * ballR;

    // Ball shadow
    ctx.beginPath();
    ctx.arc(bx + 1, by + 1, size / 40, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();

    // Ball
    const ballGrad = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, size / 40);
    ballGrad.addColorStop(0, "#FFFFFF");
    ballGrad.addColorStop(0.5, "#E0E0E0");
    ballGrad.addColorStop(1, "#A0A0A0");
    ctx.beginPath();
    ctx.arc(bx, by, size / 40, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();
  };

  // Animation
  useEffect(() => {
    if (!isSpinning) return;

    startTimeRef.current = Date.now();
    const SPIN_DURATION = 5000;
    const TOTAL_WHEEL_ROTATION = Math.PI * 10; // 5 full wheel rotations

    // Calculate target based on winning number
    let targetBallAngle = 0;
    if (winningNumber !== null) {
      const idx = WHEEL_NUMBERS.indexOf(winningNumber);
      targetBallAngle = -(idx * SEGMENT_ANGLE) - SEGMENT_ANGLE / 2;
    }
    const TOTAL_BALL_ROTATION = -Math.PI * 16 + targetBallAngle; // Opposite direction

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / SPIN_DURATION, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      const wheelRot = eased * TOTAL_WHEEL_ROTATION;
      const ballAng = eased * TOTAL_BALL_ROTATION;

      setRotation(wheelRot);
      setBallAngle(ballAng);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isSpinning, winningNumber]);

  // Reset when not spinning
  useEffect(() => {
    if (!isSpinning && winningNumber === null) {
      setRotation(0);
      setBallAngle(0);
    }
  }, [isSpinning, winningNumber]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    drawWheel(ctx, size, rotation);
    if (isSpinning) {
      drawBall(ctx, size, ballAngle);
    }
  }, [rotation, ballAngle, isSpinning]);

  return (
    <div className="relative w-full h-full aspect-square max-w-72 max-h-72 mx-auto">
      {/* Fixed ball marker at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20">
        <div className="w-4 h-4 rounded-full bg-gradient-to-b from-white to-gray-300 shadow-lg border border-gray-400"
          style={{ marginTop: "-2px" }}
        />
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: "100%", height: "100%" }}
      />

      {/* Winning number display on center */}
      {winningNumber !== null && !isSpinning && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-2xl
            ${winningNumber === 0 ? 'bg-green-600' : RED_NUMBERS.includes(winningNumber) ? 'bg-red-600' : 'bg-gray-800'}
          `}>
            {winningNumber}
          </div>
        </motion.div>
      )}
    </div>
  );
};
