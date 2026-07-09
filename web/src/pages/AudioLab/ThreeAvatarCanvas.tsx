import { useEffect, useRef, useState } from "react";
import type { AvatarFrame, StagePreset } from "./avatarEngine";

type ThreeAvatarCanvasProps = {
  modelUrl: string;
  modelName: string;
  stage: StagePreset;
  getFrame: () => AvatarFrame;
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void;
};

type MorphKind = "mouth" | "blink" | "smile" | "laugh" | "surprise" | "angry" | "sad";

type MorphBinding = {
  mesh: {
    morphTargetInfluences?: number[];
    morphTargetDictionary?: Record<string, number>;
  };
  index: number;
  kind: MorphKind;
  weight: number;
};

export function ThreeAvatarCanvas({ modelUrl, modelName, stage, getFrame, onCanvasReady }: ThreeAvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(getFrame);
  const stageRef = useRef(stage);
  const [status, setStatus] = useState("Загрузка модели");
  const [morphCount, setMorphCount] = useState(0);

  useEffect(() => {
    frameRef.current = getFrame;
  }, [getFrame]);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    onCanvasReady(canvas);
    return () => onCanvasReady(null);
  }, [onCanvasReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const targetCanvas = canvas;
    let disposed = false;
    let frameId = 0;
    let renderer: { dispose: () => void } | null = null;

    async function boot() {
      setStatus("Загрузка модели");
      setMorphCount(0);
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (disposed) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(24, targetCanvas.width / targetCanvas.height, 0.01, 100);
      camera.position.set(0, 1.15, 5.2);
      const webglRenderer = new THREE.WebGLRenderer({ canvas: targetCanvas, antialias: true, preserveDrawingBuffer: true });
      renderer = webglRenderer;
      webglRenderer.setSize(targetCanvas.width, targetCanvas.height, false);
      webglRenderer.render(scene, camera);

      const ambient = new THREE.HemisphereLight(0xffffff, 0x293241, 2.25);
      scene.add(ambient);
      const key = new THREE.DirectionalLight(0xffffff, 2.3);
      key.position.set(2.5, 4.2, 3.4);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xcce8ff, 0.9);
      fill.position.set(-3.8, 2.2, 3.6);
      scene.add(fill);

      const gltf = await new GLTFLoader().loadAsync(modelUrl);
      if (disposed) return;
      const root = gltf.scene;
      root.name = modelName;
      scene.add(root);
      normalizeModel(THREE, root);
      const bindings = collectMorphBindings(root);
      setMorphCount(bindings.length);
      setStatus(bindings.length ? `Модель загружена · morph targets: ${bindings.length}` : "Модель загружена · morph targets не найдены");

      const animate = () => {
        const activeStage = stageRef.current;
        scene.background = new THREE.Color(activeStage.middle);
        const frame = frameRef.current();
        root.rotation.set(-frame.gazeY * 0.18, frame.gazeX * 0.42, frame.headTilt * 0.85);
        root.position.y = frame.headBob * 0.004;
        applyMorphs(bindings, frame);
        webglRenderer.render(scene, camera);
        frameId = window.requestAnimationFrame(animate);
      };
      animate();
    }

    void boot().catch((error) => {
      if (disposed) return;
      setStatus(error instanceof Error ? error.message : "Не удалось загрузить модель");
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      renderer?.dispose();
    };
  }, [modelName, modelUrl]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} width={720} height={1280} className="h-full w-full" aria-label="Превью 3D-аватара" />
      <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-24px)] rounded-md bg-base-100/90 px-2 py-1 text-xs font-semibold text-base-content shadow">
        {status}
        {morphCount > 0 ? "" : " · рот fallback"}
      </div>
    </div>
  );
}

function normalizeModel(THREE: typeof import("three"), root: import("three").Object3D) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  root.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const scale = 2.9 / maxDim;
  root.scale.setScalar(scale);
  root.position.y -= 0.42;
}

function collectMorphBindings(root: import("three").Object3D): MorphBinding[] {
  const bindings: MorphBinding[] = [];
  root.traverse((node) => {
    const mesh = node as MorphBinding["mesh"];
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      const binding = classifyMorph(name);
      if (binding) bindings.push({ mesh, index, ...binding });
    }
  });
  return bindings;
}

function classifyMorph(name: string): { kind: MorphKind; weight: number } | null {
  const n = name.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
  if (/blink|eyeblink|まばたき|まばたき左|まばたき右/.test(n)) return { kind: "blink", weight: 1 };
  if (/laugh|laughing/.test(n)) return { kind: "laugh", weight: 0.9 };
  if (/smile|happy|joy|fun|relaxed|喜|笑/.test(n)) return { kind: "smile", weight: 0.75 };
  if (/surpris|shocked|wide|驚/.test(n)) return { kind: "surprise", weight: 0.9 };
  if (/angry|anger|mad|怒/.test(n)) return { kind: "angry", weight: 0.85 };
  if (/sad|sorrow|悲/.test(n)) return { kind: "sad", weight: 0.85 };
  if (/viseme|mouthopen|jawopen|aa|ih|ee|ou|oh|aah|vowel|あ|い|う|え|お/.test(n)) return { kind: "mouth", weight: 1 };
  return null;
}

function applyMorphs(bindings: MorphBinding[], frame: AvatarFrame) {
  for (const binding of bindings) {
    if (binding.mesh.morphTargetInfluences) binding.mesh.morphTargetInfluences[binding.index] = 0;
  }
  for (const binding of bindings) {
    const value = morphValue(binding.kind, frame) * binding.weight;
    if (binding.mesh.morphTargetInfluences) binding.mesh.morphTargetInfluences[binding.index] = Math.max(binding.mesh.morphTargetInfluences[binding.index] ?? 0, value);
  }
}

function morphValue(kind: MorphKind, frame: AvatarFrame): number {
  switch (kind) {
    case "mouth":
      return Math.min(1, frame.mouth + frame.laugh * 0.18 + frame.surprise * 0.2);
    case "blink":
      return Math.min(1, frame.blink + frame.laugh * 0.18);
    case "smile":
      return Math.min(1, frame.smile + frame.laugh * 0.28);
    case "laugh":
      return Math.min(1, frame.laugh);
    case "surprise":
      return Math.min(1, frame.surprise);
    case "angry":
      return Math.min(1, frame.anger);
    case "sad":
      return Math.min(1, frame.sad);
  }
}
