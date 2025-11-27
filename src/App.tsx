// @ts-nocheck
import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  Environment, 
  OrbitControls, 
  PerspectiveCamera,
  ContactShadows,
  Sparkles
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';

// --- 📜 0. 诗词库 ---
const POEMS = [
  { text: "火树银花合，星桥铁锁开", author: "苏味道" },
  { text: "东风夜放花千树", author: "辛弃疾" },
  { text: "宝马雕车香满路", author: "辛弃疾" },
  { text: "明月几时有，把酒问青天", author: "苏轼" },
  { text: "今月曾经照古人", author: "李白" },
  { text: "愿我如星君如月", author: "范成大" },
  { text: "夜夜流光相皎洁", author: "范成大" },
  { text: "众里寻他千百度", author: "辛弃疾" },
  { text: "蓦然回首，那人却在灯火阑珊处", author: "辛弃疾" },
  { text: "面朝大海，春暖花开", author: "海子" },
  { text: "黑夜给了我黑色的眼睛", author: "顾城" },
  { text: "你站在桥上看风景", author: "卞之琳" },
  { text: "看风景的人在楼上看你", author: "卞之琳" },
  { text: "生如夏花之绚烂", author: "泰戈尔" },
  { text: "死如秋叶之静美", author: "泰戈尔" },
];

// --- 🎨 1. 样式与资源 ---
const FontStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
    .font-title { font-family: 'Cinzel', serif; }
    .font-body { font-family: 'Playfair Display', serif; }
    
    .ui-layer {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 40px; box-sizing: border-box;
      z-index: 10;
    }
    .brand-box {
      border: 1px solid #C5A059; padding: 15px 30px;
      background: rgba(0,0,0,0.4); backdrop-filter: blur(5px);
      display: inline-block;
      pointer-events: auto;
    }
    .morph-btn {
      pointer-events: auto;
      background: rgba(0,0,0,0.6); border: 1px solid #C5A059; color: #C5A059;
      padding: 15px 50px; font-family: 'Cinzel', serif; font-size: 1.2rem; letter-spacing: 0.2em;
      cursor: pointer; transition: all 0.3s; text-transform: uppercase;
      box-shadow: 0 0 20px rgba(197, 160, 89, 0.1);
      /* 手机端按钮优化 */
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .morph-btn:active { background: #C5A059; color: #000; }
    
    .start-btn-container {
      position: absolute; top: 50%; left: 50%; 
      transform: translate(-50%, -50%); 
      cursor: pointer; pointer-events: auto;
      text-align: center; transition: transform 0.3s;
      /* 扩大点击区域 */
      padding: 50px; 
      -webkit-tap-highlight-color: transparent;
    }
    .start-btn-container:active { transform: translate(-50%, -50%) scale(0.95); }

    .poem-container {
      position: absolute; bottom: 20%; left: 0; width: 100%;
      text-align: center; pointer-events: none;
      transition: all 0.5s ease-out;
      padding: 0 20px; box-sizing: border-box;
    }
  `}</style>
);

// --- 🎵 2. 音频系统 ---
class AudioController {
  constructor() { this.ctx = null; this.isInit = false; }
  init() {
    // 手机端必须在 touch/click 事件内部调用
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isInit = true;
  }
  
  playClick() {
    if (!this.ctx) return;
    this.init(); // 双重保险
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(0.01, t + 1.5);
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 1.5);
  }

  playTone(pitch = 1) {
    if (!this.ctx) return;
    // 手机端如果 Context 被挂起，尝试恢复
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    const freq = 600 + Math.random() * 800 * pitch;
    osc.frequency.setValueAtTime(freq, t);
    osc.type = 'sine';

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 1.5);
  }
}
const audioCtrl = new AudioController();

const COLORS = { emerald: "#0B4628", gold: "#FFC800", dark: "#020503" };

// --- 💠 粒子系统 ---
const useParticleSystem = (count, shapeType) => {
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * Math.PI * (shapeType === 'cube' ? 25 : 35); 
      const radius = 0.1 + t * 4.5;
      const treeY = (1 - t) * 10 - 5;
      const treePos = new THREE.Vector3(Math.cos(angle) * radius, treeY, Math.sin(angle) * radius);
      const scatterPos = new THREE.Vector3((Math.random()-0.5)*30, (Math.random()-0.5)*25, (Math.random()-0.5)*20);
      const rotation = new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      const baseScale = Math.random() > 0.9 ? 1.5 : (Math.random() > 0.6 ? 0.8 : 0.4); 
      const scale = new THREE.Vector3(baseScale, baseScale, baseScale);
      const poem = POEMS[i % POEMS.length];
      temp.push({ treePos, scatterPos, rotation, scale, poem });
    }
    return temp;
  }, [count, shapeType]);
  return particles;
};

// --- 🧊 金色立方体 (双重交互) ---
const GoldCubes = ({ count, mode, isStarted, onInteract }) => {
  const meshRef = useRef();
  const particles = useParticleSystem(count, 'cube');
  const morphFactor = useRef(0);
  const hoveredId = useRef(null);

  useFrame((state, delta) => {
    if (!meshRef.current || !isStarted) return;
    morphFactor.current = THREE.MathUtils.lerp(morphFactor.current, mode === 'TREE_SHAPE' ? 1 : 0, delta * 1.5);
    const smooth = THREE.MathUtils.smoothstep(morphFactor.current, 0, 1);
    const dummy = new THREE.Object3D();
    const pos = new THREE.Vector3();
    const color = new THREE.Color();
    meshRef.current.rotation.y += delta * 0.05;

    particles.forEach((p, i) => {
      pos.lerpVectors(p.scatterPos, p.treePos, smooth);
      pos.y += Math.sin(state.clock.elapsedTime + i) * 0.05;
      dummy.position.copy(pos);
      let s = p.scale.x;
      if (i === hoveredId.current) s *= 2.0;
      dummy.scale.set(s, s, s);
      dummy.rotation.set(
        p.rotation.x + state.clock.elapsedTime * 0.5 * (1 - smooth),
        p.rotation.y + state.clock.elapsedTime * 0.3,
        p.rotation.z + state.clock.elapsedTime * 0.5 * (1 - smooth)
      );
      color.set(i === hoveredId.current ? '#FFFFFF' : COLORS.gold);
      meshRef.current.setColorAt(i, color);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  const handleTrigger = (e) => {
    if(!isStarted) return;
    e.stopPropagation();
    const id = e.instanceId;
    hoveredId.current = id;
    audioCtrl.playTone(1.2);
    onInteract(particles[id].poem);
  };

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, count]} 
      frustumCulled={false}
      onPointerOver={handleTrigger} // 电脑悬停
      onClick={handleTrigger}       // 🔴 手机点击 (关键修复)
      onPointerOut={() => { hoveredId.current = null; }}
    >
      <boxGeometry args={[0.35, 0.35, 0.35]} /> 
      <meshStandardMaterial color={COLORS.gold} roughness={0.15} metalness={1.0} envMapIntensity={2} />
    </instancedMesh>
  );
};

// --- 🟢 祖母绿球体 (双重交互) ---
const EmeraldSpheres = ({ count, mode, isStarted, onInteract }) => {
  const meshRef = useRef();
  const particles = useParticleSystem(count, 'sphere');
  const morphFactor = useRef(0);
  const hoveredId = useRef(null);

  useFrame((state, delta) => {
    if (!meshRef.current || !isStarted) return;
    morphFactor.current = THREE.MathUtils.lerp(morphFactor.current, mode === 'TREE_SHAPE' ? 1 : 0, delta * 1.2); 
    const smooth = THREE.MathUtils.smoothstep(morphFactor.current, 0, 1);
    const dummy = new THREE.Object3D();
    const pos = new THREE.Vector3();
    const color = new THREE.Color();

    particles.forEach((p, i) => {
      pos.lerpVectors(p.scatterPos, p.treePos, smooth);
      pos.y += Math.cos(state.clock.elapsedTime + i) * 0.08; 
      dummy.position.copy(pos);
      let s = p.scale.x;
      if (i === hoveredId.current) s *= 2.0;
      dummy.scale.set(s, s, s);
      color.set(i === hoveredId.current ? '#4fffb0' : COLORS.emerald).multiplyScalar(i === hoveredId.current ? 1 : (0.8 + 0.5 * smooth));
      meshRef.current.setColorAt(i, color);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  const handleTrigger = (e) => {
    if(!isStarted) return;
    e.stopPropagation();
    const id = e.instanceId;
    hoveredId.current = id;
    audioCtrl.playTone(0.8);
    onInteract(particles[id].poem);
  };

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, count]} 
      frustumCulled={false}
      onPointerOver={handleTrigger} // 电脑悬停
      onClick={handleTrigger}       // 🔴 手机点击 (关键修复)
      onPointerOut={() => { hoveredId.current = null; }}
    >
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshPhysicalMaterial color={COLORS.emerald} roughness={0.2} metalness={0.1} transmission={0.4} thickness={2.0} clearcoat={1.0} />
    </instancedMesh>
  );
};

const LuxuryDust = ({ isStarted }) => {
  if (!isStarted) return null;
  return <Sparkles count={400} scale={20} size={6} speed={0.4} opacity={0.8} color={COLORS.gold} />;
};

const PoetryDisplay = ({ activePoem }) => (
  <div className="poem-container" style={{
    opacity: activePoem ? 1 : 0,
    transform: `translateY(${activePoem ? 0 : '20px'})`,
  }}>
    {activePoem && (
      <>
        <h2 className="font-body" style={{ 
          color: '#fff', fontSize: '1.8rem', margin: '0 0 10px', fontStyle: 'italic',
          textShadow: `0 0 30px ${COLORS.gold}`, letterSpacing: '0.05em'
        }}>
          “{activePoem.text}”
        </h2>
        <p className="font-title" style={{ 
          color: COLORS.gold, fontSize: '0.8rem', letterSpacing: '0.4em',
          textTransform: 'uppercase'
        }}>
          {activePoem.author}
        </p>
      </>
    )}
  </div>
);

// --- 🎬 主场景 ---
export default function ArixGrandLuxury() {
  const [isStarted, setStarted] = useState(false);
  const [mode, setMode] = useState('SCATTERED'); 
  const [activePoem, setActivePoem] = useState(null);
  
  // ⏳ 自动隐藏诗词的计时器
  const timerRef = useRef(null);

  const handleInteract = useCallback((poem) => {
    setActivePoem(poem);
    // 清除上一个计时器
    if (timerRef.current) clearTimeout(timerRef.current);
    // 3秒后自动隐藏 (适应手机端点击体验)
    timerRef.current = setTimeout(() => {
      setActivePoem(null);
    }, 3500);
  }, []);

  const handleStart = () => {
    audioCtrl.init(); 
    setStarted(true);
  };

  const toggleMode = (e) => {
    e.stopPropagation(); // 防止点按钮时触发背景事件
    audioCtrl.playClick(); 
    setMode(prev => prev === 'TREE_SHAPE' ? 'SCATTERED' : 'TREE_SHAPE');
  };

  return (
    <>
      <FontStyles />
      <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
          // 🔴 允许手机端点击 Canvas 背景时清空诗词
          onClick={() => setActivePoem(null)}
        >
          <PerspectiveCamera makeDefault position={[0, 0, 16]} fov={50} />
          <Environment preset="city" /> 
          <ambientLight intensity={0.2} color={COLORS.emerald} />
          <spotLight position={[10, 20, 10]} angle={0.3} penumbra={1} intensity={300} color="#FFD700" castShadow />
          <pointLight position={[-10, -5, -5]} intensity={50} color="#00ff88" distance={20} />

          <group visible={isStarted}> 
              <GoldCubes count={400} mode={mode} isStarted={isStarted} onInteract={handleInteract} />
              <EmeraldSpheres count={400} mode={mode} isStarted={isStarted} onInteract={handleInteract} />
              <LuxuryDust isStarted={isStarted} />
          </group>

          <ContactShadows resolution={1024} scale={50} blur={4} opacity={0.5} color={COLORS.gold} />
          <EffectComposer disableNormalPass>
            <Bloom luminanceThreshold={0.9} mipBlur intensity={1.5} radius={0.4} />
            <ChromaticAberration offset={[0.001, 0.001]} />
            <Noise opacity={0.05} />
            <Vignette eskil={false} offset={0.1} darkness={1.0} />
          </EffectComposer>
          <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.5} maxPolarAngle={Math.PI/1.6} />
        </Canvas>

        <div className="ui-layer">
          <div style={{ textAlign: 'left' }}>
            <div className="brand-box">
              <h1 className="font-title" style={{ margin: 0, color: COLORS.gold, fontSize: '1.5rem', letterSpacing: '0.2em' }}>
                GRAND LUXURY
              </h1>
              <span className="font-title" style={{ color: '#fff', fontSize: '0.7rem', letterSpacing: '0.4em' }}>INTERACTIVE TREE</span>
            </div>
          </div>

          {!isStarted ? (
             <div className="start-btn-container" onClick={handleStart}>
               <h1 className="font-title" style={{ fontSize: '4rem', color: COLORS.gold, textShadow: '0 0 30px rgba(255,200,0,0.5)', margin: 0 }}>ARIX</h1>
               <div style={{ color: '#fff', letterSpacing: '0.5em', marginTop: '10px' }}>TAP TO START</div>
             </div>
          ) : (
             <div style={{ textAlign: 'center', marginBottom: '40px', pointerEvents: 'none' }}>
                <button className="morph-btn" onClick={toggleMode}>
                  {mode === 'TREE_SHAPE' ? 'DISPERSE' : 'ASSEMBLE'}
                </button>
                <div className="font-title" style={{ color: COLORS.gold, marginTop: '10px', fontSize: '0.8rem', opacity: 0.6 }}>
                  EST 2024 DESIGNED BY GEMINI
                </div>
             </div>
          )}
          
          <PoetryDisplay activePoem={activePoem} />
        </div>
      </div>
    </>
  );
}