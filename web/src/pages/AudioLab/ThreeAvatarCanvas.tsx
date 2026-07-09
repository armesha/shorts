import { useEffect, useRef, useState } from "react";
import type { AvatarFrame, StagePreset } from "./avatarEngine";

type ThreeAvatarCanvasProps = {
  modelUrl: string;
  modelName: string;
  stage: StagePreset;
  getFrame: () => AvatarFrame;
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void;
};

type MorphKind = "mouth" | "aa" | "ih" | "ou" | "ee" | "oh" | "blink" | "smile" | "laugh" | "surprise" | "angry" | "sad" | "relaxed";

type MorphMesh = {
  name?: string;
  morphTargetInfluences?: number[];
  morphTargetDictionary?: Record<string, number>;
};

type MorphBinding = {
  mesh: MorphMesh;
  index: number;
  kind: MorphKind;
  weight: number;
};

type LoadedGltf = {
  scene: import("three").Object3D;
  parser?: {
    json?: VrmGltfJson;
    associations?: Map<import("three").Object3D, { nodes?: number; meshes?: number }>;
  };
};

type VrmGltfJson = {
  meshes?: Array<{ name?: string }>;
  nodes?: Array<{ name?: string }>;
  extensions?: {
    VRMC_vrm?: {
      expressions?: {
        preset?: Record<string, VrmExpression | undefined>;
        custom?: Record<string, VrmExpression | undefined>;
      };
    };
    VRM?: {
      blendShapeMaster?: {
        blendShapeGroups?: Vrm0BlendShapeGroup[];
      };
    };
  };
};

type VrmExpression = {
  morphTargetBinds?: Array<{
    node?: number;
    index?: number;
    weight?: number;
  }>;
};

type Vrm0BlendShapeGroup = {
  name?: string;
  presetName?: string;
  binds?: Array<{
    mesh?: number;
    index?: number;
    weight?: number;
  }>;
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
      const camera = new THREE.PerspectiveCamera(26, targetCanvas.width / targetCanvas.height, 0.01, 100);
      camera.position.set(0, 0.45, 5.7);
      camera.lookAt(0, 0.15, 0);
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
      const vrmBindings = collectVrmExpressionBindings(gltf as LoadedGltf, root);
      const vrm0Bindings = vrmBindings.length ? [] : collectVrm0BlendShapeBindings(gltf as LoadedGltf, root);
      const bindings = vrmBindings.length ? vrmBindings : vrm0Bindings.length ? vrm0Bindings : collectMorphBindings(root);
      setMorphCount(bindings.length);
      setStatus(
        bindings.length
          ? vrmBindings.length
            ? `Модель загружена · VRM expressions: ${bindings.length}`
            : vrm0Bindings.length
              ? `Модель загружена · VRM 0.x expressions: ${bindings.length}`
            : `Модель загружена · morph targets: ${bindings.length}`
          : "Модель загружена · morph targets не найдены",
      );

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
  root.position.set(0, 0, 0);
  root.scale.setScalar(1);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  root.position.sub(center);
  const height = Math.max(size.y, 0.01);
  const widthDepth = Math.max(size.x, size.z, 0.01);
  const scale = Math.min(2.34 / height, 1.72 / widthDepth);
  root.scale.setScalar(scale);
  const normalizedBox = new THREE.Box3().setFromObject(root);
  const normalizedCenter = new THREE.Vector3();
  normalizedBox.getCenter(normalizedCenter);
  root.position.y += 0.12 - normalizedCenter.y;
  root.position.x = 0;
  root.position.z = 0;
}

function collectMorphBindings(root: import("three").Object3D): MorphBinding[] {
  const bindings: MorphBinding[] = [];
  root.traverse((node) => {
    const mesh = node as MorphMesh;
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      const binding = classifyMorph(name);
      if (binding) bindings.push({ mesh, index, ...binding });
    }
  });
  return bindings;
}

function collectVrmExpressionBindings(gltf: LoadedGltf, root: import("three").Object3D): MorphBinding[] {
  const expressions = gltf.parser?.json?.extensions?.VRMC_vrm?.expressions;
  if (!expressions) return [];
  const jsonNodes = gltf.parser?.json?.nodes ?? [];
  const groups = [
    ...Object.entries(expressions.preset ?? {}),
    ...Object.entries(expressions.custom ?? {}),
  ];
  const bindings: MorphBinding[] = [];
  const seen = new Set<string>();
  for (const [name, expression] of groups) {
    const kind = classifyVrmExpression(name);
    if (!kind || !expression?.morphTargetBinds?.length) continue;
    for (const bind of expression.morphTargetBinds) {
      const nodeIndex = Number(bind.node);
      const morphIndex = Number(bind.index);
      if (!Number.isInteger(nodeIndex) || !Number.isInteger(morphIndex) || morphIndex < 0) continue;
      const nodeName = jsonNodes[nodeIndex]?.name ?? "";
      const mesh = findMorphMesh(gltf, root, nodeName, nodeIndex, morphIndex);
      if (!mesh) continue;
      const key = `${nodeName}:${morphIndex}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bindings.push({ mesh, index: morphIndex, kind, weight: normalizeVrmWeight(bind.weight) });
    }
  }
  return bindings;
}

function collectVrm0BlendShapeBindings(gltf: LoadedGltf, root: import("three").Object3D): MorphBinding[] {
  const groups = gltf.parser?.json?.extensions?.VRM?.blendShapeMaster?.blendShapeGroups ?? [];
  const bindings: MorphBinding[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const kind = classifyVrm0Expression(group.presetName || group.name || "");
    if (!kind || !group.binds?.length) continue;
    for (const bind of group.binds) {
      const meshIndex = Number(bind.mesh);
      const morphIndex = Number(bind.index);
      if (!Number.isInteger(meshIndex) || !Number.isInteger(morphIndex) || morphIndex < 0) continue;
      const mesh = findMorphMeshByMeshIndex(gltf, root, meshIndex, morphIndex);
      if (!mesh) continue;
      const key = `${meshIndex}:${morphIndex}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bindings.push({ mesh, index: morphIndex, kind, weight: normalizeVrmWeight(bind.weight) });
    }
  }
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

function classifyVrmExpression(name: string): MorphKind | null {
  const n = name.trim().toLowerCase();
  switch (n) {
    case "aa":
    case "ih":
    case "ou":
    case "ee":
    case "oh":
      return n;
    case "blink":
    case "blinkleft":
    case "blinkright":
      return "blink";
    case "happy":
      return "smile";
    case "laugh":
      return "laugh";
    case "surprised":
      return "surprise";
    case "angry":
      return "angry";
    case "sad":
      return "sad";
    case "relaxed":
      return "relaxed";
    default:
      return null;
  }
}

function classifyVrm0Expression(name: string): MorphKind | null {
  const n = name.trim().toLowerCase();
  switch (n) {
    case "a":
    case "aa":
      return "aa";
    case "i":
    case "ih":
      return "ih";
    case "u":
    case "ou":
      return "ou";
    case "e":
    case "ee":
      return "ee";
    case "o":
    case "oh":
      return "oh";
    case "blink":
    case "blink_l":
    case "blink_r":
      return "blink";
    case "joy":
    case "happy":
    case "fun":
      return "smile";
    case "angry":
      return "angry";
    case "sorrow":
    case "sad":
      return "sad";
    default:
      return null;
  }
}

function findMorphMesh(gltf: LoadedGltf, root: import("three").Object3D, nodeName: string, nodeIndex: number, morphIndex: number): MorphMesh | null {
  const associations = gltf.parser?.associations;
  let associated: MorphMesh | null = null;
  let exact: MorphMesh | null = null;
  let normalized: MorphMesh | null = null;
  const target = normalizeNodeName(nodeName);
  root.traverse((node) => {
    if (associated) return;
    const mesh = node as MorphMesh;
    if (!mesh.morphTargetInfluences || morphIndex >= mesh.morphTargetInfluences.length) return;
    const association = associations?.get(node);
    if (association?.nodes === nodeIndex) {
      associated = mesh;
      return;
    }
    if (nodeName && mesh.name === nodeName) {
      exact = mesh;
      return;
    }
    if (!normalized && target && normalizeNodeName(mesh.name ?? "") === target) {
      normalized = mesh;
    }
  });
  return associated ?? exact ?? normalized;
}

function findMorphMeshByMeshIndex(gltf: LoadedGltf, root: import("three").Object3D, meshIndex: number, morphIndex: number): MorphMesh | null {
  const associations = gltf.parser?.associations;
  const meshName = gltf.parser?.json?.meshes?.[meshIndex]?.name ?? "";
  let associated: MorphMesh | null = null;
  let exact: MorphMesh | null = null;
  let normalized: MorphMesh | null = null;
  const target = normalizeNodeName(meshName);
  root.traverse((node) => {
    if (associated) return;
    const mesh = node as MorphMesh;
    if (!mesh.morphTargetInfluences || morphIndex >= mesh.morphTargetInfluences.length) return;
    const association = associations?.get(node);
    if (association?.meshes === meshIndex) {
      associated = mesh;
      return;
    }
    if (meshName && mesh.name === meshName) {
      exact = mesh;
      return;
    }
    if (!normalized && target && normalizeNodeName(mesh.name ?? "") === target) {
      normalized = mesh;
    }
  });
  return associated ?? exact ?? normalized;
}

function normalizeNodeName(value: string): string {
  return value.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
}

function normalizeVrmWeight(value: unknown): number {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.max(0, Math.min(1, normalized));
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
    case "aa":
      return Math.min(1, frame.mouth * (0.72 + Math.sin(frame.time * 15) * 0.1) + frame.laugh * 0.18);
    case "ih":
      return Math.min(1, frame.mouth * 0.2 + frame.whisper * 0.16);
    case "ou":
      return Math.min(1, frame.mouth * 0.14 + frame.surprise * 0.14);
    case "ee":
      return Math.min(1, frame.mouth * 0.18 + frame.smile * 0.1);
    case "oh":
      return Math.min(1, frame.mouth * 0.12 + frame.surprise * 0.4);
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
    case "relaxed":
      return Math.min(1, frame.whisper * 0.35 + frame.smile * 0.12);
  }
}
