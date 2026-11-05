import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  Download,
  Camera,
  RotateCcw,
  Sparkles,
  User,
  Shield,
  Check,
  Copy,
  Layers,
  Smile,
  Sun,
  Video,
  FileCode,
} from "lucide-react";
import {
  CHARACTER_PRESETS,
  STORY_POSES,
  type CharacterConfig,
  type ExpressionId,
  type LightingPresetId,
  type PoseId,
} from "./characterTypes";
import { buildCharacterModel, type CharacterRig } from "./characterModel";

export default function CharacterStudio() {
  const mountRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<CharacterRig | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const lightsRef = useRef<{
    ambient: THREE.AmbientLight;
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
  } | null>(null);

  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [config, setConfig] = useState<CharacterConfig>(CHARACTER_PRESETS[0]);
  const [activePose, setActivePose] = useState<PoseId>("hero-point");
  const [activeExpression, setActiveExpression] = useState<ExpressionId>("heroic");
  const [lightingPreset, setLightingPreset] = useState<LightingPresetId>("zack-d-studio");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Initialize Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d24);
    sceneRef.current = scene;

    // Camera (cinematic angle)
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 1.3, 3.2);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.95, 0); // Focus on chest/head
    controls.maxDistance = 6;
    controls.minDistance = 1;
    controls.maxPolarAngle = Math.PI / 2 + 0.05;
    controlsRef.current = controls;

    // Pedestal / Floor Stage
    const stageGroup = new THREE.Group();
    const pedestalGeom = new THREE.CylinderGeometry(1.2, 1.3, 0.1, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.8,
      metalness: 0.2,
    });
    const pedestal = new THREE.Mesh(pedestalGeom, pedestalMat);
    pedestal.position.y = -0.05;
    pedestal.receiveShadow = true;
    stageGroup.add(pedestal);

    const ringGeom = new THREE.RingGeometry(1.15, 1.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    stageGroup.add(ring);

    // Grid helper
    const grid = new THREE.GridHelper(3, 12, 0x334155, 0x1e293b);
    grid.position.y = 0.003;
    stageGroup.add(grid);

    scene.add(stageGroup);

    // Lighting (Studio Zack D Films 3-point lighting setup)
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const key = new THREE.DirectionalLight(0xfff7ed, 2.2);
    key.position.set(2, 4, 3);
    key.castShadow = true;

    const fill = new THREE.DirectionalLight(0x93c5fd, 0.9);
    fill.position.set(-3, 2, 1.5);

    const rim = new THREE.DirectionalLight(0xfef08a, 1.4);
    rim.position.set(0, 3, -3);

    scene.add(ambient, key, fill, rim);
    lightsRef.current = { ambient, key, fill, rim };

    // Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      controls.update();
      if (rigRef.current) {
        rigRef.current.updateAnimation(elapsedTime, delta);
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      controls.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Rebuild character mesh when config changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous rig if exists
    if (rigRef.current) {
      scene.remove(rigRef.current.root);
      rigRef.current = null;
    }

    // Build new rig
    const newRig = buildCharacterModel(config);
    scene.add(newRig.root);
    rigRef.current = newRig;

    // Apply active pose & expression
    newRig.applyPose(activePose);
    newRig.applyExpression(activeExpression);
  }, [config]);

  // Apply pose updates
  useEffect(() => {
    if (rigRef.current) {
      rigRef.current.applyPose(activePose);
    }
  }, [activePose]);

  // Apply expression updates
  useEffect(() => {
    if (rigRef.current) {
      rigRef.current.applyExpression(activeExpression);
    }
  }, [activeExpression]);

  // Apply lighting updates
  useEffect(() => {
    const lights = lightsRef.current;
    const scene = sceneRef.current;
    if (!lights || !scene) return;

    switch (lightingPreset) {
      case "sky-lobby-fire":
        scene.background = new THREE.Color(0x1c100c);
        lights.ambient.color.setHex(0x451a03);
        lights.ambient.intensity = 0.5;
        lights.key.color.setHex(0xf97316); // Fire flame glow
        lights.key.intensity = 3.0;
        lights.key.position.set(-2, 1.5, 2);
        lights.fill.color.setHex(0xef4444);
        lights.fill.intensity = 1.2;
        lights.rim.color.setHex(0xfbbf24);
        lights.rim.intensity = 2.0;
        break;

      case "stairwell-emergency":
        scene.background = new THREE.Color(0x0f172a);
        lights.ambient.color.setHex(0x1e293b);
        lights.ambient.intensity = 0.6;
        lights.key.color.setHex(0xe2e8f0); // Cold fluorescent
        lights.key.intensity = 1.8;
        lights.key.position.set(0, 3.5, 1);
        lights.fill.color.setHex(0x06b6d4);
        lights.fill.intensity = 0.5;
        lights.rim.color.setHex(0x38bdf8);
        lights.rim.intensity = 1.0;
        break;

      case "street-daylight":
        scene.background = new THREE.Color(0x38bdf8);
        lights.ambient.color.setHex(0xffffff);
        lights.ambient.intensity = 1.0;
        lights.key.color.setHex(0xfffbeb);
        lights.key.intensity = 2.5;
        lights.key.position.set(3, 5, 2);
        lights.fill.color.setHex(0xbae6fd);
        lights.fill.intensity = 1.1;
        lights.rim.color.setHex(0xfef08a);
        lights.rim.intensity = 0.8;
        break;

      case "zack-d-studio":
      default:
        scene.background = new THREE.Color(0x1a1d24);
        lights.ambient.color.setHex(0xffffff);
        lights.ambient.intensity = 0.7;
        lights.key.color.setHex(0xfff7ed);
        lights.key.intensity = 2.2;
        lights.key.position.set(2, 4, 3);
        lights.fill.color.setHex(0x93c5fd);
        lights.fill.intensity = 0.9;
        lights.rim.color.setHex(0xfef08a);
        lights.rim.intensity = 1.4;
        break;
    }
  }, [lightingPreset]);

  // Handle Preset selection
  const handleSelectPreset = (index: number) => {
    setActivePresetIndex(index);
    const preset = CHARACTER_PRESETS[index];
    setConfig(preset);

    // Match recommended story pose
    if (preset.id === "welles-crowther") {
      setActivePose("hero-point");
      setActiveExpression("heroic");
    } else if (preset.id === "office-worker-tie") {
      setActivePose("carry-receive");
      setActiveExpression("panic");
    } else if (preset.id === "injured-woman") {
      setActivePose("exhausted-slump");
      setActiveExpression("exhausted");
    } else if (preset.id === "firefighter-fdny") {
      setActivePose("firefighter-climb");
      setActiveExpression("shouting");
    } else if (preset.id === "police-officer") {
      setActivePose("police-direct");
      setActiveExpression("shouting");
    } else {
      setActivePose("panic-run");
      setActiveExpression("panic");
    }
  };

  // Export to GLB file
  const handleExportGLB = () => {
    if (!rigRef.current) return;
    setExporting(true);

    const exporter = new GLTFExporter();
    exporter.parse(
      rigRef.current.root,
      (gltf) => {
        setExporting(false);
        const blob = new Blob([gltf as ArrayBuffer], { type: "model/gltf-binary" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${config.id}_${activePose}.glb`;
        link.click();
        URL.revokeObjectURL(url);
      },
      (error) => {
        setExporting(false);
        console.error("Error exporting GLB:", error);
        alert("Ошибка экспорта GLB: " + error);
      },
      { binary: true }
    );
  };

  // Take Snapshot PNG
  const handleTakeSnapshot = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const dataUrl = renderer.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${config.id}_frame.png`;
    link.click();
  };

  // Copy JSON config
  const handleCopyConfig = () => {
    navigator.clipboard.writeText(JSON.stringify({ ...config, pose: activePose, expression: activeExpression }, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset Camera
  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 1.3, 3.2);
      controlsRef.current.target.set(0, 0.95, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base-300 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">3D Студия персонажей (Nixly AI / Zack D Films)</h1>
              <p className="text-sm text-base-content/70">
                Создание low-poly стилизованных 3D персонажей в вебе с анимациями, позами и экспортом в .GLB для Блендера
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportGLB}
            disabled={exporting}
            className="btn btn-primary btn-sm gap-2 shadow-sm"
            title="Экспорт готовой 3D-модели в .GLB для Саса (открывается напрямую в Blender)"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Экспорт..." : "Скачать .GLB (в Blender)"}
          </button>

          <button
            onClick={handleTakeSnapshot}
            className="btn btn-outline btn-sm gap-2"
            title="Сохранить снимок кадра в высоком разрешении"
          >
            <Camera className="w-4 h-4" />
            Снимок
          </button>

          <button
            onClick={handleCopyConfig}
            className="btn btn-ghost btn-sm gap-1.5"
            title="Скопировать JSON конфигурации"
          >
            {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            {copied ? "Скопировано" : "JSON"}
          </button>
        </div>
      </div>

      {/* Main Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 3D Viewport Column */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
          <div className="relative w-full aspect-[9/10] md:aspect-[4/3] rounded-2xl overflow-hidden shadow-xl border border-base-300 bg-neutral">
            {/* Three.js Canvas Container */}
            <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Overlays / Viewport Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-1.5 pointer-events-none">
              <div className="badge badge-primary gap-1.5 shadow-md">
                <User className="w-3.5 h-3.5" />
                {config.name.split(" (")[0]}
              </div>
              <div className="badge badge-neutral gap-1.5 bg-black/60 backdrop-blur-md text-xs text-white">
                <Video className="w-3 h-3 text-warning" />
                {STORY_POSES.find((p) => p.id === activePose)?.nameRu}
              </div>
            </div>

            {/* Viewport Floating Controls */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-base-100/80 backdrop-blur-md p-1 rounded-xl shadow-md border border-base-300">
              <button
                onClick={handleResetCamera}
                className="btn btn-ghost btn-xs btn-square"
                title="Сбросить положение камеры"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quote Subtitle Banner */}
            {config.quote && (
              <div className="absolute bottom-4 left-4 right-4 text-center pointer-events-none">
                <div className="inline-block bg-black/75 backdrop-blur-md text-white text-xs md:text-sm px-4 py-2 rounded-xl shadow-lg border border-white/10 font-medium">
                  «{config.quote}»
                </div>
              </div>
            )}
          </div>

          {/* Lighting Presets */}
          <div className="flex items-center gap-2 bg-base-200/60 p-2.5 rounded-xl border border-base-300 text-xs">
            <Sun className="w-4 h-4 text-warning shrink-0" />
            <span className="font-medium text-base-content/80">Освещение сцены:</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "zack-d-studio", label: "Zack D Студия" },
                { id: "sky-lobby-fire", label: "Пожар 78 этажа" },
                { id: "stairwell-emergency", label: "Аварийная лестница" },
                { id: "street-daylight", label: "Улица Manhattan" },
              ].map((light) => (
                <button
                  key={light.id}
                  onClick={() => setLightingPreset(light.id as LightingPresetId)}
                  className={`btn btn-xs ${lightingPreset === light.id ? "btn-primary" : "btn-ghost"}`}
                >
                  {light.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Controls Column */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5">
          {/* Preset Selector */}
          <div className="bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Персонажи из видео (9/11)
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {CHARACTER_PRESETS.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(idx)}
                  className={`p-2.5 rounded-xl text-left border transition-all text-xs flex flex-col justify-between gap-1 ${
                    activePresetIndex === idx
                      ? "border-primary bg-primary/10 font-semibold text-primary shadow-sm"
                      : "border-base-300 hover:bg-base-200 text-base-content/80"
                  }`}
                >
                  <span className="line-clamp-1">{p.name.split(" (")[0]}</span>
                  <span className="text-[10px] text-base-content/60 font-normal line-clamp-1">{p.role}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Story Poses Selector */}
          <div className="bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Сюжетные позы (покадрово)
            </h2>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {STORY_POSES.map((pose) => (
                <button
                  key={pose.id}
                  onClick={() => {
                    setActivePose(pose.id);
                    setActiveExpression(pose.expression);
                  }}
                  className={`w-full p-2 rounded-xl text-left border transition-all flex items-start gap-2.5 text-xs ${
                    activePose === pose.id
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-base-200 hover:bg-base-200 text-base-content/80"
                  }`}
                >
                  <span className="badge badge-sm badge-neutral shrink-0">{pose.timecode}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{pose.nameRu}</div>
                    <div className="text-[10px] text-base-content/60 line-clamp-1 font-normal">{pose.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Facial Expressions */}
          <div className="bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
              <Smile className="w-4 h-4 text-primary" />
              Мимика лица и эмоции
            </h2>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "neutral", label: "Нейтрально" },
                { id: "heroic", label: "Решимость" },
                { id: "panic", label: "Шок / Паника" },
                { id: "exhausted", label: "Усталость" },
                { id: "shouting", label: "Крик" },
              ].map((expr) => (
                <button
                  key={expr.id}
                  onClick={() => setActiveExpression(expr.id as ExpressionId)}
                  className={`btn btn-xs ${activeExpression === expr.id ? "btn-primary" : "btn-outline"}`}
                >
                  {expr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customizer: Accessories & Colors */}
          <div className="bg-base-100 p-4 rounded-2xl border border-base-300 shadow-sm space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Аксессуары и стили
            </h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer border border-base-200 p-2 rounded-xl">
                <input
                  type="checkbox"
                  checked={config.accessories.bandana}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      accessories: { ...c.accessories, bandana: e.target.checked },
                    }))
                  }
                  className="checkbox checkbox-xs checkbox-primary"
                />
                <span>Красная бандана</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer border border-base-200 p-2 rounded-xl">
                <input
                  type="checkbox"
                  checked={config.accessories.necktie}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      accessories: { ...c.accessories, necktie: e.target.checked },
                    }))
                  }
                  className="checkbox checkbox-xs checkbox-primary"
                />
                <span>Красный галстук</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer border border-base-200 p-2 rounded-xl">
                <input
                  type="checkbox"
                  checked={config.accessories.firefighterGear}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      accessories: { ...c.accessories, firefighterGear: e.target.checked },
                    }))
                  }
                  className="checkbox checkbox-xs checkbox-primary"
                />
                <span>Экипировка FDNY</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer border border-base-200 p-2 rounded-xl">
                <input
                  type="checkbox"
                  checked={config.accessories.policeGear}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      accessories: { ...c.accessories, policeGear: e.target.checked },
                    }))
                  }
                  className="checkbox checkbox-xs checkbox-primary"
                />
                <span>Фуражка и жетон</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Collaboration Note for Sas and Armen */}
      <div className="bg-base-200/50 p-5 rounded-2xl border border-base-300 space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <FileCode className="w-4 h-4 text-info" />
          Инструкция по интеграции для Саса и Армена
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-base-content/80">
          <div className="space-y-1.5 bg-base-100 p-3.5 rounded-xl border border-base-200">
            <span className="font-semibold text-primary">1. Для Саса (Blender-локация):</span>
            <p>
              Нажмите кнопку <b>«Скачать .GLB (в Blender)»</b>. Модель скачивается в бинарном стандарте glTF со всеми материалами,
              иерархией суставов и цветами. В Блендере Сас делает <code>File → Import → glTF 2.0 (.glb)</code> и персонаж
              встаёт прямо в его готовую локацию (Скай-Лобби, лестницу или улицу).
            </p>
          </div>
          <div className="space-y-1.5 bg-base-100 p-3.5 rounded-xl border border-base-200">
            <span className="font-semibold text-secondary">2. Для Армена (Автоматизация и веб):</span>
            <p>
              Персонажи генерируются процедурно через Three.js, поэтому их можно не только выгружать в Блендер, но и напрямую
              рендерить в браузере или через headless Puppeteer/Canvas для видеогенератора шортсов без необходимости запускать тяжёлый Блендер на сервере.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
