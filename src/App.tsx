// @ts-nocheck
import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  Environment, 
  OrbitControls, 
  Float, 
  Stars, 
  PerspectiveCamera,
  ContactShadows,
  Sparkles
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';

// --- 📜 0. 诗词库 (The Soul) ---
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
    }
    .morph-btn:hover { background: #C5A059; color: #000; box-shadow: 0 0 40px #C5A059; }
    
    .start-btn-container {
      position: absolute; top: 50%; left: 50%; 
      transform: translate(-50%, -50%); 
      cursor: pointer; pointer-events: auto;
      text-align: center; transition: transform 0.3s;
    }
    .start-btn-container:hover { transform: translate(-50%, -50%) scale(1.05); }

    /* 诗词展示样式 */
    .poem-container {
      position: absolute; bottom: 20%; left: 0; width: 100%;
      text-align: center; pointer-events: none;
      transition: all 0.5s ease-out;
    }
  `}</style>
);

// --- 🎵 2. 音频系统 (交互音效回归) ---
class AudioController {
  constructor() { this.ctx = null; this.isInit = false; }
  init() {
    if (this.isInit) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    this.isInit = true;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  
  // 按钮点击音效 (低沉)
  playClick() {
    if (!this.ctx) return;
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

  // 悬停交互音效 (清脆风铃)
  playTone(pitch = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // 随机音高，模拟碰撞
    const freq = 600 + Math.random() * 800 * pitch;
    osc.frequency.setValueAtTime(freq, t);
    osc.type = 'sine'; // 纯净的正弦波最像玻璃/水晶声

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 1.5);
  }
}
const audioCtrl = new AudioController();

const COLORS = {
  emerald: "#0B4628", 
  gold: "#FFC800",    
  dark: "#020503"
};

// --- 💠 通用粒子系统逻辑 (增加诗词绑定) ---
const useParticleSystem = (count, shapeType) => {
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * Math.PI * (shapeType === 'cube' ? 25 : 35); 
      const radius = 0.1 + t * 4.5;
      const treeY = (1 - t) * 10 - 5;
      const treePos = new THREE.Vector3(Math.cos(angle) * radius, treeY, Math.sin(angle) * radius);
      
      const scatterPos = new THREE.Vector3(
        (Math.random() - 0.5) * 30, 
        (Math.random() - 0.5) * 25, 
        (Math.random() - 0.5) * 20  
      );
      
      const rotation = new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
      const randomSize = Math.random();
      const baseScale = randomSize > 0.9 ? 1.5 : (randomSize > 0.6 ? 0.8 : 0.4); 
      const scale = new THREE.Vector3(baseScale, baseScale, baseScale);

      // 📜 绑定诗词
      const poem = POEMS[i % POEMS.length];

      temp.push({ treePos, scatterPos, rotation, scale, poem });
    }
    return temp;
  }, [count, shapeType]);
  return particles;
};

// --- 🧊 组件：金色立方体 (带交互) ---
const GoldCubes = ({ count, mode, isStarted, onHoverChange }) => {
  const meshRef = useRef();
  const particles = useParticleSystem(count, 'cube');
  const morphFactor = useRef(0);
  const hoveredId = useRef(null);

  useFrame((state, delta) => {
    if (!meshRef.current || !isStarted) return;
    const target = mode === 'TREE_SHAPE' ? 1 : 0;
    morphFactor.current = THREE.MathUtils.lerp(morphFactor.current, target, delta * 1.5);
    const smooth = THREE.MathUtils.smoothstep(morphFactor.current, 0, 1);

    const dummy = new THREE.Object3D();
    const pos = new THREE.Vector3();
    const color = new THREE.Color();

    meshRef.current.rotation.y += delta * 0.05;

    particles.forEach((p, i) => {
      pos.lerpVectors(p.scatterPos, p.treePos, smooth);
      pos.y += Math.sin(state.clock.elapsedTime + i) * 0.05;
      dummy.position.copy(pos);
      
      // 交互放大逻辑
      let s = p.scale.x;
      if (i === hoveredId.current) s *= 2.0; // 悬停时变大
      dummy.scale.set(s, s, s);

      dummy.rotation.x = p.rotation.x + state.clock.elapsedTime * 0.5 * (1 - smooth);
      dummy.rotation.y = p.rotation.y + state.clock.elapsedTime * 0.3;
      dummy.rotation.z = p.rotation.z + state.clock.elapsedTime * 0.5 * (1 - smooth);
      
      // 交互高亮
      if (i === hoveredId.current) {
        color.set('#FFFFFF'); // 悬停变白金
      } else {
        color.set(COLORS.gold);
      }
      meshRef.current.setColorAt(i, color);

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, count]} 
      frustumCulled={false}
      onPointerOver={(e) => {
        if(!isStarted) return;
        e.stopPropagation();
        const id = e.instanceId;
        hoveredId.current = id;
        audioCtrl.playTone(1.2); // 金色声音稍高
        onHoverChange(particles[id].poem);
      }}
      onPointerOut={() => {
        hoveredId.current = null;
        onHoverChange(null);
      }}
    >
      <boxGeometry args={[0.35, 0.35, 0.35]} /> 
      <meshStandardMaterial color={COLORS.gold} roughness={0.15} metalness={1.0} envMapIntensity={2} />
    </instancedMesh>
  );
};

// --- 🟢 组件：祖母绿球体 (带交互) ---
const EmeraldSpheres = ({ count, mode, isStarted, onHoverChange }) => {
  const meshRef = useRef();
  const particles = useParticleSystem(count, 'sphere');
  const morphFactor = useRef(0);
  const hoveredId = useRef(null);

  useFrame((state, delta) => {
    if (!meshRef.current || !isStarted) return;
    const target = mode === 'TREE_SHAPE' ? 1 : 0;
    morphFactor.current = THREE.MathUtils.lerp(morphFactor.current, target, delta * 1.2); 
    const smooth = THREE.MathUtils.smoothstep(morphFactor.current, 0, 1);

    const dummy = new THREE.Object3D();
    const pos = new THREE.Vector3();
    const color = new THREE.Color();

    particles.forEach((p, i) => {
      pos.lerpVectors(p.scatterPos, p.treePos, smooth);
      pos.y += Math.cos(state.clock.elapsedTime + i) * 0.08; 
      dummy.position.copy(pos);
      
      // 交互放大
      let s = p.scale.x;
      if (i === hoveredId.current) s *= 2.0;
      dummy.scale.set(s, s, s);

      // 颜色逻辑
      if (i === hoveredId.current) {
        color.set('#4fffb0'); // 悬停变亮青色
      } else {
        color.set(COLORS.emerald).multiplyScalar(0.8 + 0.5 * smooth);
      }
      meshRef.current.setColorAt(i, color);

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if(meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, count]} 
      frustumCulled={false}
      onPointerOver={(e) => {
        if(!isStarted) return;
        e.stopPropagation();
        const id = e.instanceId;
        hoveredId.current = id;
        audioCtrl.playTone(0.8); // 玉石声音稍低
        onHoverChange(particles[id].poem);
      }}
      onPointerOut={() => {
        hoveredId.current = null;
        onHoverChange(null);
      }}
    >
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshPhysicalMaterial color={COLORS.emerald} roughness={0.2} metalness={0.1} transmission={0.4} thickness={2.0} clearcoat={1.0} />
    </instancedMesh>
  );
};

// --- ✨ 装饰：星尘 ---
const LuxuryDust = ({ isStarted }) => {
  if (!isStarted) return null;
  return (
    <Sparkles count={400} scale={20} size={6} speed={0.4} opacity={0.8} color={COLORS.gold} />
  );
};

// --- 📜 UI组件：诗词展示 ---
const PoetryDisplay = ({ activePoem }) => (
  <div className="poem-container" style={{
    opacity: activePoem ? 1 : 0,
    transform: `translateY(${activePoem ? 0 : '20px'})`,
  }}>
    {activePoem && (
      <>
        <h2 className="font-body" style={{ 
          color: '#fff', fontSize: '2.2rem', margin: '0 0 10px', fontStyle: 'italic',
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
  const [activePoem, setActivePoem] = useState(null); // 🟢 恢复诗词状态

  const handleStart = () => {
    audioCtrl.init(); audioCtrl.resume();
    setStarted(true);
  };

  const toggleMode = () => {
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
        >
          <PerspectiveCamera makeDefault position={[0, 0, 16]} fov={50} />
          <Environment preset="city" /> 
          
          <ambientLight intensity={0.2} color={COLORS.emerald} />
          <spotLight position={[10, 20, 10]} angle={0.3} penumbra={1} intensity={300} color="#FFD700" castShadow />
          <pointLight position={[-10, -5, -5]} intensity={50} color="#00ff88" distance={20} />

          <group visible={isStarted}> 
              {/* 🟢 将 onHoverChange 传递给子组件 */}
              <GoldCubes count={400} mode={mode} isStarted={isStarted} onHoverChange={setActivePoem} />
              <EmeraldSpheres count={400} mode={mode} isStarted={isStarted} onHoverChange={setActivePoem} />
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

        {/* 2D UI Layer */}
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
               <div style={{ color: '#fff', letterSpacing: '0.5em', marginTop: '10px' }}>CLICK TO START</div>
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
          
          {/* 🟢 诗词展示层 */}
          <PoetryDisplay activePoem={activePoem} />
        </div>

      </div>
    </>
  );
}