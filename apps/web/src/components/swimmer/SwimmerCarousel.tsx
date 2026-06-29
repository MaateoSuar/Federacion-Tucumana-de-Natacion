'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stroke = 'freestyle' | 'backstroke' | 'breaststroke' | 'butterfly';

const STROKES: { id: Stroke; label: string }[] = [
  { id: 'freestyle', label: 'Libre' },
  { id: 'backstroke', label: 'Espalda' },
  { id: 'breaststroke', label: 'Pecho' },
  { id: 'butterfly', label: 'Mariposa' },
];

// ─── Skeleton definition ──────────────────────────────────────────────────────
//
// Joint indices:
//  0=head  1=neck  2=chest  3=hip
//  4=L_shoulder  5=L_elbow  6=L_hand
//  7=R_shoulder  8=R_elbow  9=R_hand
// 10=L_hip  11=L_knee  12=L_foot
// 13=R_hip  14=R_knee  15=R_foot

// [jointA, jointB, radius, colorGroup]  — colorGroup: 0=body, 1=limb
const BONES: readonly [number, number, number, 0 | 1][] = [
  [0, 1, 0.065, 0],   // neck
  [1, 2, 0.115, 0],   // upper torso
  [2, 3, 0.105, 0],   // lower torso
  [4, 5, 0.052, 1],   // L upper arm
  [5, 6, 0.042, 1],   // L forearm
  [7, 8, 0.052, 1],   // R upper arm
  [8, 9, 0.042, 1],   // R forearm
  [10, 11, 0.060, 1], // L thigh
  [11, 12, 0.050, 1], // L shin
  [13, 14, 0.060, 1], // R thigh
  [14, 15, 0.050, 1], // R shin
] as const;

const JOINT_RADII: Record<number, number> = {
  0: 0.13,  // head
  1: 0.065, // neck
  2: 0.06,  3: 0.06,  // torso joints
  4: 0.048, 5: 0.040, 6: 0.035,  // L arm
  7: 0.048, 8: 0.040, 9: 0.035,  // R arm
  10: 0.055, 11: 0.048, 12: 0.040, // L leg
  13: 0.055, 14: 0.048, 15: 0.040, // R leg
};

// ─── Scratch objects (avoid GC in render loop) ────────────────────────────────

const _s = new THREE.Vector3();
const _e = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

// ─── Joint position computation ───────────────────────────────────────────────

function v3(x: number, y: number, z: number) { return new THREE.Vector3(x, y, z); }

const SPEED = 1.1;

function getJoints(stroke: Stroke, t: number): THREE.Vector3[] {
  const a = t * SPEED;

  if (stroke === 'freestyle') {
    const lKick = Math.sin(a * 3.8) * 0.11;
    const rKick = Math.sin(a * 3.8 + Math.PI) * 0.11;
    const lPhase = a, rPhase = a + Math.PI;
    // Arms alternate: forward arc over water, pull under
    const lHandZ = Math.cos(lPhase) * 0.62;
    const lHandY = Math.max(0, Math.sin(lPhase)) * 0.42 - 0.04;
    const rHandZ = Math.cos(rPhase) * 0.62;
    const rHandY = Math.max(0, Math.sin(rPhase)) * 0.42 - 0.04;
    return [
      v3(0,   0.12,  0.62),
      v3(0,  -0.02,  0.48),
      v3(0,  -0.02,  0.14),
      v3(0,  -0.02, -0.20),
      v3(-0.20, -0.02, 0.38),
      v3(-0.22, Math.max(0, Math.sin(lPhase)) * 0.18 - 0.04, Math.cos(lPhase) * 0.28),
      v3(-0.16, lHandY, lHandZ),
      v3( 0.20, -0.02, 0.38),
      v3( 0.22, Math.max(0, Math.sin(rPhase)) * 0.18 - 0.04, Math.cos(rPhase) * 0.28),
      v3( 0.16, rHandY, rHandZ),
      v3(-0.11, -0.02, -0.22),
      v3(-0.11, lKick,  -0.58),
      v3(-0.11, lKick * 1.3, -0.92),
      v3( 0.11, -0.02, -0.22),
      v3( 0.11, rKick,  -0.58),
      v3( 0.11, rKick * 1.3, -0.92),
    ];
  }

  if (stroke === 'backstroke') {
    const lKick = Math.sin(a * 3.8) * 0.10;
    const rKick = Math.sin(a * 3.8 + Math.PI) * 0.10;
    const lPhase = a, rPhase = a + Math.PI;
    // Body face-up; arms windmill over/through water (from hip up and forward)
    const lHandZ = -Math.cos(lPhase) * 0.65;
    const lHandY = Math.max(0, Math.sin(lPhase)) * 0.52 + 0.06;
    const rHandZ = -Math.cos(rPhase) * 0.65;
    const rHandY = Math.max(0, Math.sin(rPhase)) * 0.52 + 0.06;
    return [
      v3(0,   0.17,  0.58),
      v3(0,   0.08,  0.44),
      v3(0,   0.06,  0.10),
      v3(0,   0.04, -0.22),
      v3(-0.22, 0.08, 0.34),
      v3(-0.24, lHandY * 0.5, lHandZ * 0.45),
      v3(-0.19, lHandY, lHandZ),
      v3( 0.22, 0.08, 0.34),
      v3( 0.24, rHandY * 0.5, rHandZ * 0.45),
      v3( 0.19, rHandY, rHandZ),
      v3(-0.11,  0.04, -0.22),
      v3(-0.11, lKick, -0.57),
      v3(-0.11, lKick * 1.3, -0.91),
      v3( 0.11,  0.04, -0.22),
      v3( 0.11, rKick, -0.57),
      v3( 0.11, rKick * 1.3, -0.91),
    ];
  }

  if (stroke === 'breaststroke') {
    const cycle = Math.sin(a * 0.85);
    const kickCycle = Math.sin(a * 0.85 - 0.7);
    const armFwd  = (cycle + 1) / 2;              // 0→recover 1→extended
    const armSpread = Math.abs(Math.sin(a * 0.85 + 0.5)) * 0.33;
    const armDepth = (1 - armFwd) * 0.13;
    const legSpread = Math.max(0, -kickCycle) * 0.48;
    const legBend   = Math.max(0,  kickCycle) * 0.42;
    const bWave = cycle * 0.05;
    return [
      v3(0, 0.11 + bWave, 0.62),
      v3(0, bWave,         0.47),
      v3(0, bWave * 0.5,   0.12),
      v3(0, 0,            -0.20),
      v3(-0.18, -armDepth,  0.34),
      v3(-0.18 - armSpread, -armDepth - 0.04, 0.12 + armFwd * 0.22),
      v3(-0.15 - armSpread * 0.7, -armDepth - 0.07, 0.40 + armFwd * 0.33),
      v3( 0.18, -armDepth,  0.34),
      v3( 0.18 + armSpread, -armDepth - 0.04, 0.12 + armFwd * 0.22),
      v3( 0.15 + armSpread * 0.7, -armDepth - 0.07, 0.40 + armFwd * 0.33),
      v3(-0.12,  0, -0.22),
      v3(-0.12 - legSpread * 0.45,  legBend * 0.28, -0.54 + legBend * 0.10),
      v3(-0.12 - legSpread,        -legBend * 0.08, -0.86 - legSpread * 0.08),
      v3( 0.12,  0, -0.22),
      v3( 0.12 + legSpread * 0.45,  legBend * 0.28, -0.54 + legBend * 0.10),
      v3( 0.12 + legSpread,        -legBend * 0.08, -0.86 - legSpread * 0.08),
    ];
  }

  // butterfly
  const w1 = Math.sin(a) * 0.13;
  const w2 = Math.sin(a + 0.45) * 0.16;
  const w3 = Math.sin(a + 0.90) * 0.19;
  const armCycle  = Math.sin(a);
  const armFwd    = (armCycle + 1) / 2;
  const armAbove  = Math.max(0, armCycle) * 0.52;
  const armDepth  = Math.max(0, -armCycle) * 0.13;
  const armZ = -0.22 + armFwd * 1.05;
  const armX = 0.32 - armFwd * 0.10;
  const armY = armAbove - armDepth;
  return [
    v3(0, 0.11 + w1, 0.62),
    v3(0, w1,         0.47),
    v3(0, w1 * 0.5,   0.12),
    v3(0, w2,        -0.20),
    v3(-0.20, w1 * 0.3, 0.34),
    v3(-armX * 0.65, armY * 0.5 + w1 * 0.3, 0.34 + (armZ + 0.22) * 0.38),
    v3(-armX * 0.5,  armY + w1 * 0.2, armZ),
    v3( 0.20, w1 * 0.3, 0.34),
    v3( armX * 0.65, armY * 0.5 + w1 * 0.3, 0.34 + (armZ + 0.22) * 0.38),
    v3( armX * 0.5,  armY + w1 * 0.2, armZ),
    v3(-0.11, w2, -0.22),
    v3(-0.10, w3, -0.57),
    v3(-0.09, w3 * 1.2, -0.92),
    v3( 0.11, w2, -0.22),
    v3( 0.10, w3, -0.57),
    v3( 0.09, w3 * 1.2, -0.92),
  ];
}

// ─── Swimmer mesh ─────────────────────────────────────────────────────────────

function Swimmer({ stroke }: { stroke: Stroke }) {
  const boneRefs  = useRef<(THREE.Mesh | null)[]>([]);
  const jointRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const joints = getJoints(stroke, t);

    // Position joint spheres
    joints.forEach((pos, i) => {
      jointRefs.current[i]?.position.copy(pos);
    });

    // Orient bone cylinders
    BONES.forEach(([a, b], i) => {
      const mesh = boneRefs.current[i];
      const ja = joints[a];
      const jb = joints[b];
      if (!mesh || !ja || !jb) return;
      _s.copy(ja);
      _e.copy(jb);
      _mid.addVectors(_s, _e).multiplyScalar(0.5);
      _dir.subVectors(_e, _s);
      const len = _dir.length();
      mesh.position.copy(_mid);
      mesh.scale.y = len;
      _dir.normalize();
      const dot = _dir.dot(_up);
      if (Math.abs(dot) > 0.9999) {
        _q.identity();
        if (dot < 0) _q.set(1, 0, 0, 0); // flip 180°
      } else {
        _q.setFromUnitVectors(_up, _dir);
      }
      mesh.quaternion.copy(_q);
    });
  });

  return (
    <group>
      {/* Joint spheres */}
      {Object.entries(JOINT_RADII).map(([idx, r]) => {
        const i = parseInt(idx);
        const isHead = i === 0;
        return (
          <mesh key={`j${i}`} ref={(el) => { jointRefs.current[i] = el; }}>
            <sphereGeometry args={[r, 14, 10]} />
            <meshStandardMaterial
              color={isHead ? '#ade8f4' : '#0096c7'}
              roughness={0.25}
              metalness={0.18}
            />
          </mesh>
        );
      })}

      {/* Bone cylinders — height=1, scaled via scale.y */}
      {BONES.map(([, , r, cg], i) => (
        <mesh key={`b${i}`} ref={(el) => { boneRefs.current[i] = el; }}>
          <cylinderGeometry args={[r, r, 1, 9, 1]} />
          <meshStandardMaterial
            color={cg === 0 ? '#0096c7' : '#0077b6'}
            roughness={0.22}
            metalness={0.22}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Water surface ────────────────────────────────────────────────────────────

function Water() {
  return (
    <>
      {/* Water plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#0096c7" transparent opacity={0.06} roughness={0.9} />
      </mesh>
      {/* Lane line glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[0.02, 6]} />
        <meshStandardMaterial color="#48cae4" transparent opacity={0.18} />
      </mesh>
    </>
  );
}

// ─── Full 3D scene ────────────────────────────────────────────────────────────

function Scene({ stroke }: { stroke: Stroke }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} color="#ffffff" />
      <directionalLight position={[-3, 1, -2]} intensity={0.5} color="#48cae4" />
      <pointLight position={[0, 2, 0]} intensity={0.7} color="#00b4d8" distance={6} />

      <Water />
      <Swimmer stroke={stroke} />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={1.2}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI * 0.72}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

// ─── Carousel shell (exported) ────────────────────────────────────────────────

export default function SwimmerCarousel() {
  const [idx, setIdx] = useState(0);

  // Auto-advance every 5 s
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % STROKES.length), 5000);
    return () => clearInterval(id);
  }, []);

  const stroke = STROKES[idx]!;

  return (
    <div className="relative w-full select-none" style={{ height: 220 }}>
      {/* Canvas */}
      <Canvas
        camera={{ position: [1.6, 0.35, 1.6], fov: 48 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <Scene stroke={stroke.id} />
        </Suspense>
      </Canvas>

      {/* Water line overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-aqua-400/20 to-transparent" />

      {/* Stroke label + dots */}
      <div className="absolute bottom-0 inset-x-0 flex flex-col items-center gap-2 pb-1 pointer-events-none">
        <span className="text-aqua-400/55 text-xs font-mono tracking-[0.2em] uppercase">
          {stroke.label}
        </span>
        <div className="flex items-center gap-2 pointer-events-auto">
          {STROKES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIdx(i)}
              aria-label={s.label}
              className={`rounded-full transition-all duration-300 ${
                i === idx
                  ? 'w-5 h-1.5 bg-aqua-400'
                  : 'w-1.5 h-1.5 bg-pool-600 hover:bg-pool-400'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Drag hint */}
      <p className="pointer-events-none absolute top-2 right-3 text-pool-600 text-xs">
        arrastrar para rotar
      </p>
    </div>
  );
}
