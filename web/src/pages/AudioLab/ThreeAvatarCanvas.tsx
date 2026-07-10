import { useEffect, useRef, useState } from "react";
import { Focus, MoveDown, MoveUp, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import type { AvatarFrame, SpeechViseme, StagePreset } from "./avatarEngine";

type ThreeAvatarCanvasProps = {
  modelUrl: string;
  modelName: string;
  stage: StagePreset;
  framing: "full" | "head";
  presenterMode: boolean;
  getFrame: () => AvatarFrame;
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void;
};

type CameraAction = "rotate-left" | "rotate-right" | "move-up" | "move-down" | "zoom-in" | "zoom-out" | "reset";

type MorphKind =
  | "mouth"
  | "aa"
  | "ih"
  | "ou"
  | "ee"
  | "oh"
  | "blink"
  | "smile"
  | "laugh"
  | "surprise"
  | "angry"
  | "sad"
  | "relaxed"
  | `speech:${SpeechViseme}`;

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

type RigBone = import("three").Object3D;

type LiveRig = {
  normalizedVrm?: boolean;
  hips?: RigBone;
  spine?: RigBone;
  chest?: RigBone;
  neck?: RigBone;
  head?: RigBone;
  leftShoulder?: RigBone;
  leftUpperArm?: RigBone;
  leftLowerArm?: RigBone;
  leftHand?: RigBone;
  rightShoulder?: RigBone;
  rightUpperArm?: RigBone;
  rightLowerArm?: RigBone;
  rightHand?: RigBone;
  rest: Map<RigBone, import("three").Euler>;
};

type LoadedGltf = {
  scene: import("three").Object3D;
  userData?: { vrm?: VrmRuntime };
  parser?: {
    json?: VrmGltfJson;
    associations?: Map<import("three").Object3D, { nodes?: number; meshes?: number }>;
  };
};

type VrmExpressionRuntime = {
  expressionName: string;
};

type VrmExpressionManagerRuntime = {
  expressions: VrmExpressionRuntime[];
  setValue: (name: string, value: number) => void;
};

type VrmRuntime = {
  scene: import("three").Object3D;
  expressionManager?: VrmExpressionManagerRuntime;
  humanoid?: {
    getNormalizedBoneNode: (name: string) => RigBone | null;
  };
  update: (delta: number) => void;
};

type VrmExpressionDriver = {
  manager: VrmExpressionManagerRuntime;
  names: Set<string>;
};

type VrmGltfJson = {
  meshes?: Array<{ name?: string }>;
  nodes?: Array<{ name?: string; mesh?: number }>;
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

export function ThreeAvatarCanvas({ modelUrl, modelName, stage, framing, presenterMode, getFrame, onCanvasReady }: ThreeAvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(getFrame);
  const stageRef = useRef(stage);
  const cameraActionRef = useRef<(action: CameraAction) => void>(() => undefined);
  const [status, setStatus] = useState("Загрузка модели");
  const [morphCount, setMorphCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [controlsReady, setControlsReady] = useState(false);

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
    let controls: import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | null = null;
    let resetCamera: (() => void) | null = null;

    async function boot() {
      setStatus("Загрузка модели");
      setMorphCount(0);
      setControlsReady(false);
      const [THREE, { GLTFLoader }, { OrbitControls }, { MeshoptDecoder }, { VRMLoaderPlugin, VRMUtils }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/controls/OrbitControls.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
        import("@pixiv/three-vrm"),
      ]);
      if (disposed) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(26, targetCanvas.width / targetCanvas.height, 0.01, 100);
      const cameraHomePosition = new THREE.Vector3(0, 0.45, 5.7);
      const cameraHomeTarget = new THREE.Vector3(0, 0.15, 0);
      camera.position.copy(cameraHomePosition);
      camera.lookAt(cameraHomeTarget);
      const webglRenderer = new THREE.WebGLRenderer({ canvas: targetCanvas, antialias: true, preserveDrawingBuffer: true });
      renderer = webglRenderer;
      webglRenderer.setSize(targetCanvas.width, targetCanvas.height, false);
      webglRenderer.render(scene, camera);

      const orbit = new OrbitControls(camera, targetCanvas);
      controls = orbit;
      orbit.target.copy(cameraHomeTarget);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
      orbit.rotateSpeed = 0.72;
      orbit.zoomSpeed = 0.9;
      orbit.panSpeed = 0.78;
      orbit.screenSpacePanning = true;
      orbit.minDistance = framing === "head" ? 0.65 : 1.2;
      orbit.maxDistance = 12;
      orbit.minPolarAngle = Math.PI * 0.08;
      orbit.maxPolarAngle = Math.PI * 0.92;
      orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
      orbit.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      orbit.touches.ONE = THREE.TOUCH.ROTATE;
      orbit.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      orbit.addEventListener("start", () => setDragging(true));
      orbit.addEventListener("end", () => setDragging(false));
      orbit.update();
      orbit.saveState();
      resetCamera = () => {
        const damping = orbit.enableDamping;
        orbit.enableDamping = false;
        orbit.update();
        camera.position.copy(cameraHomePosition);
        orbit.target.copy(cameraHomeTarget);
        orbit.update();
        orbit.enableDamping = damping;
        orbit.saveState();
      };
      cameraActionRef.current = (action) => {
        if (action === "reset") {
          resetCamera?.();
          return;
        }
        const offset = camera.position.clone().sub(orbit.target);
        if (action === "rotate-left" || action === "rotate-right") {
          offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), action === "rotate-left" ? -Math.PI / 12 : Math.PI / 12);
          camera.position.copy(orbit.target).add(offset);
        } else if (action === "zoom-in" || action === "zoom-out") {
          const factor = action === "zoom-in" ? 0.84 : 1.19;
          offset.setLength(Math.max(orbit.minDistance, Math.min(orbit.maxDistance, offset.length() * factor)));
          camera.position.copy(orbit.target).add(offset);
        } else {
          const delta = offset.length() * 0.06 * (action === "move-up" ? 1 : -1);
          camera.position.y += delta;
          orbit.target.y += delta;
        }
        orbit.update();
      };
      setControlsReady(true);
      targetCanvas.addEventListener("dblclick", resetCamera);

      const ambient = new THREE.HemisphereLight(0xffffff, 0x293241, 2.25);
      scene.add(ambient);
      const key = new THREE.DirectionalLight(0xffffff, 2.3);
      key.position.set(2.5, 4.2, 3.4);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xcce8ff, 0.9);
      fill.position.set(-3.8, 2.2, 3.6);
      scene.add(fill);

      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(modelUrl);
      if (disposed) return;
      const loadedVrm = (gltf as LoadedGltf).userData?.vrm;
      if (loadedVrm) {
        ambient.intensity = 1.35;
        key.intensity = 1.55;
        fill.intensity = 0.5;
      }
      if (loadedVrm) VRMUtils.rotateVRM0(loadedVrm as Parameters<typeof VRMUtils.rotateVRM0>[0]);
      const root = loadedVrm?.scene ?? gltf.scene;
      root.name = modelName;
      root.traverse((node) => {
        node.frustumCulled = false;
      });
      scene.add(root);
      normalizeModel(THREE, root, framing);
      if (framing === "head") {
        const normalizedBox = new THREE.Box3().setFromObject(root);
        const normalizedSize = new THREE.Vector3();
        normalizedBox.getSize(normalizedSize);
        const faceY = normalizedBox.max.y - normalizedSize.y * 0.19;
        const focusY = faceY + normalizedSize.y * 0.08;
        cameraHomePosition.set(0, focusY + 0.04, 1.78);
        cameraHomeTarget.set(0, focusY, 0);
        resetCamera();
      }
      const presenterMotion = presenterMode;
      const basePosition = root.position.clone();
      const baseScale = root.scale.x || 1;
      const baseRotation = root.rotation.clone();
      const expressionDriver = createVrmExpressionDriver(loadedVrm?.expressionManager);
      const vrmBindings = expressionDriver ? [] : collectVrmExpressionBindings(gltf as LoadedGltf, root);
      const vrm0Bindings = expressionDriver || vrmBindings.length ? [] : collectVrm0BlendShapeBindings(gltf as LoadedGltf, root);
      const bindings = expressionDriver ? [] : vrmBindings.length ? vrmBindings : vrm0Bindings.length ? vrm0Bindings : collectMorphBindings(root);
      const rig = loadedVrm?.humanoid ? collectVrmLiveRig(loadedVrm) : collectLiveRig(root);
      const expressionCount = expressionDriver?.names.size ?? bindings.length;
      setMorphCount(expressionCount);
      setStatus(
        expressionCount
          ? expressionDriver
            ? `Модель загружена · VRM expressions: ${expressionCount}`
            : vrmBindings.length
            ? `Модель загружена · VRM expressions: ${bindings.length}`
            : vrm0Bindings.length
              ? `Модель загружена · VRM 0.x expressions: ${bindings.length}`
            : `Модель загружена · morph targets: ${bindings.length}`
          : "Модель загружена · morph targets не найдены",
      );

      let previousFrameAt = performance.now();
      const animate = () => {
        const frameAt = performance.now();
        const delta = Math.min(0.1, Math.max(0, (frameAt - previousFrameAt) / 1000));
        previousFrameAt = frameAt;
        const activeStage = stageRef.current;
        scene.background = new THREE.Color(activeStage.middle);
        const frame = frameRef.current();
        root.scale.setScalar(baseScale);
        root.rotation.set(
          baseRotation.x + (presenterMotion ? 0 : -frame.gazeY * 0.18),
          baseRotation.y + (presenterMotion ? 0 : frame.gazeX * 0.42),
          baseRotation.z + (presenterMotion ? 0 : frame.headTilt * 0.85),
        );
        root.position.copy(basePosition);
        root.position.y += frame.headBob * (presenterMotion ? 0.00025 : 0.004);
        applyRigMotion(rig, frame, presenterMotion);
        if (expressionDriver) applyVrmExpressions(expressionDriver, frame);
        else applyMorphs(bindings, frame);
        loadedVrm?.update(delta);
        orbit.update();
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
      if (resetCamera) targetCanvas.removeEventListener("dblclick", resetCamera);
      cameraActionRef.current = () => undefined;
      controls?.dispose();
      renderer?.dispose();
    };
  }, [framing, modelName, modelUrl, presenterMode]);

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        width={720}
        height={1280}
        className={`h-full w-full touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        aria-label="Превью 3D-аватара"
        onContextMenu={(event) => event.preventDefault()}
      />
      <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-24px)] rounded-md bg-base-100/90 px-2 py-1 text-xs font-semibold text-base-content shadow">
        {status}
        {morphCount > 0 ? "" : " · рот fallback"}
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border border-base-300/70 bg-base-100/90 p-1 shadow-lg backdrop-blur-sm">
        <CameraButton label="Повернуть влево" disabled={!controlsReady} onClick={() => cameraActionRef.current("rotate-left")}><RotateCcw size={16} /></CameraButton>
        <CameraButton label="Повернуть вправо" disabled={!controlsReady} onClick={() => cameraActionRef.current("rotate-right")}><RotateCw size={16} /></CameraButton>
        <CameraButton label="Поднять кадр" disabled={!controlsReady} onClick={() => cameraActionRef.current("move-up")}><MoveUp size={16} /></CameraButton>
        <CameraButton label="Опустить кадр" disabled={!controlsReady} onClick={() => cameraActionRef.current("move-down")}><MoveDown size={16} /></CameraButton>
        <CameraButton label="Отдалить" disabled={!controlsReady} onClick={() => cameraActionRef.current("zoom-out")}><ZoomOut size={16} /></CameraButton>
        <CameraButton label="Приблизить" disabled={!controlsReady} onClick={() => cameraActionRef.current("zoom-in")}><ZoomIn size={16} /></CameraButton>
        <CameraButton label="Вернуть крупный план" disabled={!controlsReady} onClick={() => cameraActionRef.current("reset")}><Focus size={16} /></CameraButton>
      </div>
    </div>
  );
}

function CameraButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="btn btn-square btn-sm h-8 min-h-8 w-8"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function normalizeModel(THREE: typeof import("three"), root: import("three").Object3D, framing: "full" | "head") {
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
  const scale = framing === "head" ? 2.34 / height : Math.min(2.34 / height, 1.72 / widthDepth);
  root.scale.setScalar(scale);
  const normalizedBox = new THREE.Box3().setFromObject(root);
  const normalizedCenter = new THREE.Vector3();
  normalizedBox.getCenter(normalizedCenter);
  root.position.y += 0.12 - normalizedCenter.y;
  root.position.x = 0;
  root.position.z = 0;
}

function collectLiveRig(root: import("three").Object3D): LiveRig {
  const rig: LiveRig = { rest: new Map() };
  const byName = new Map<string, RigBone>();
  root.traverse((node) => {
    const key = normalizeNodeName(node.name ?? "");
    if (key) byName.set(key, node);
  });
  rig.hips = findBone(byName, ["hips", "mixamorighips"]);
  rig.spine = findBone(byName, ["spine", "mixamorigspine", "spine1", "mixamorigspine1"]);
  rig.chest = findBone(byName, ["chest", "spine2", "mixamorigspine2", "mixamorigchest"]);
  rig.neck = findBone(byName, ["neck", "mixamorigneck"]);
  rig.head = findBone(byName, ["head", "mixamorighead"]);
  rig.leftShoulder = findBone(byName, ["leftshoulder", "mixamorigleftshoulder"]);
  rig.leftUpperArm = findBone(byName, ["leftupperarm", "leftarm", "mixamorigleftarm"]);
  rig.leftLowerArm = findBone(byName, ["leftlowerarm", "leftforearm", "mixamorigleftforearm"]);
  rig.leftHand = findBone(byName, ["lefthand", "mixamoriglefthand"]);
  rig.rightShoulder = findBone(byName, ["rightshoulder", "mixamorigrightshoulder"]);
  rig.rightUpperArm = findBone(byName, ["rightupperarm", "rightarm", "mixamorigrightarm"]);
  rig.rightLowerArm = findBone(byName, ["rightlowerarm", "rightforearm", "mixamorigrightforearm"]);
  rig.rightHand = findBone(byName, ["righthand", "mixamorigrighthand"]);

  captureRigRest(rig);
  return rig;
}

function collectVrmLiveRig(vrm: VrmRuntime): LiveRig {
  const get = (name: string) => vrm.humanoid?.getNormalizedBoneNode(name) ?? undefined;
  const rig: LiveRig = {
    normalizedVrm: true,
    hips: get("hips"),
    spine: get("spine"),
    chest: get("chest"),
    neck: get("neck"),
    head: get("head"),
    leftShoulder: get("leftShoulder"),
    leftUpperArm: get("leftUpperArm"),
    leftLowerArm: get("leftLowerArm"),
    leftHand: get("leftHand"),
    rightShoulder: get("rightShoulder"),
    rightUpperArm: get("rightUpperArm"),
    rightLowerArm: get("rightLowerArm"),
    rightHand: get("rightHand"),
    rest: new Map(),
  };
  captureRigRest(rig);
  return rig;
}

function captureRigRest(rig: LiveRig) {
  for (const bone of Object.values(rig)) {
    if (!bone || bone instanceof Map || typeof bone !== "object" || !("rotation" in bone)) continue;
    rig.rest.set(bone, bone.rotation.clone());
  }
}

function findBone(byName: Map<string, RigBone>, names: string[]): RigBone | undefined {
  for (const name of names) {
    const found = byName.get(normalizeNodeName(name));
    if (found) return found;
  }
  return undefined;
}

function applyRigMotion(rig: LiveRig, frame: AvatarFrame, presenterMode: boolean) {
  if (presenterMode) {
    applyPresenterRigMotion(rig, frame);
    return;
  }
  const t = frame.time;
  const breathe = Math.sin(t * 1.25);
  const sway = Math.sin(t * 0.72);
  const talk = frame.mouth;
  const energy = Math.max(frame.laugh, frame.surprise * 0.7, talk * 0.35);

  setBoneRotation(rig, rig.hips, breathe * 0.012, frame.gazeX * 0.035 + sway * 0.018, -sway * 0.018);
  setBoneRotation(rig, rig.spine, breathe * 0.02, frame.gazeX * 0.055, frame.headTilt * 0.16);
  setBoneRotation(rig, rig.chest, -0.03 + breathe * 0.035 + energy * 0.03, frame.gazeX * 0.065, frame.headTilt * 0.24 + sway * 0.02);
  setBoneRotation(rig, rig.neck, -frame.gazeY * 0.12, frame.gazeX * 0.12, frame.headTilt * 0.18);
  setBoneRotation(rig, rig.head, -frame.gazeY * 0.18 + frame.surprise * 0.06, frame.gazeX * 0.2, frame.headTilt * 0.28);

  const leftWave = Math.sin(t * 1.7) * 0.055 + frame.laugh * Math.sin(t * 9) * 0.08;
  const rightWave = Math.sin(t * 1.55 + 1.2) * 0.055 - frame.laugh * Math.sin(t * 8.5) * 0.08;
  const armLift = frame.surprise * 0.18 + frame.laugh * 0.1;
  const sideDampen = 1;

  setBoneRotation(rig, rig.leftShoulder, 0, 0, (0.18 + leftWave * 0.4) * sideDampen);
  setBoneRotation(rig, rig.rightShoulder, 0, 0, (-0.18 + rightWave * 0.4) * sideDampen);
  setBoneRotation(rig, rig.leftUpperArm, 0.05 + breathe * 0.015, 0.04 + frame.gazeX * 0.03, (0.92 - armLift + leftWave) * sideDampen);
  setBoneRotation(rig, rig.rightUpperArm, 0.05 + breathe * 0.015, -0.04 + frame.gazeX * 0.03, (-0.92 + armLift + rightWave) * sideDampen);
  setBoneRotation(rig, rig.leftLowerArm, 0.06 + talk * 0.04, 0.02, (0.28 + leftWave * 0.8) * sideDampen);
  setBoneRotation(rig, rig.rightLowerArm, 0.06 + talk * 0.04, -0.02, (-0.28 + rightWave * 0.8) * sideDampen);
  setBoneRotation(rig, rig.leftHand, Math.sin(t * 2.1) * 0.04, 0, Math.sin(t * 1.4) * 0.04);
  setBoneRotation(rig, rig.rightHand, Math.sin(t * 2.0 + 0.8) * 0.04, 0, Math.sin(t * 1.3 + 0.5) * 0.04);
}

function applyPresenterRigMotion(rig: LiveRig, frame: AvatarFrame) {
  const breathe = Math.sin(frame.time * 1.05);
  const armDirection = rig.normalizedVrm ? 1 : -1;
  setBoneRotation(rig, rig.hips, 0, 0, 0);
  setBoneRotation(rig, rig.spine, breathe * 0.003, 0, 0);
  setBoneRotation(rig, rig.chest, -0.018 + breathe * 0.006, frame.gazeX * 0.008, frame.headTilt * 0.025);
  setBoneRotation(rig, rig.neck, -frame.gazeY * 0.035, frame.gazeX * 0.045, frame.headTilt * 0.055);
  setBoneRotation(rig, rig.head, -frame.gazeY * 0.055 + frame.surprise * 0.012, frame.gazeX * 0.07, frame.headTilt * 0.09);
  setBoneRotation(rig, rig.leftShoulder, 0, 0, -0.05);
  setBoneRotation(rig, rig.rightShoulder, 0, 0, 0.05);
  setBoneRotation(rig, rig.leftUpperArm, 0.04, 0.025, armDirection * 1.15);
  setBoneRotation(rig, rig.rightUpperArm, 0.04, -0.025, armDirection * -1.15);
  setBoneRotation(rig, rig.leftLowerArm, 0.05, 0.01, armDirection * 0.12);
  setBoneRotation(rig, rig.rightLowerArm, 0.05, -0.01, armDirection * -0.12);
  setBoneRotation(rig, rig.leftHand, 0, 0, 0);
  setBoneRotation(rig, rig.rightHand, 0, 0, 0);
}

function setBoneRotation(rig: LiveRig, bone: RigBone | undefined, x = 0, y = 0, z = 0) {
  if (!bone) return;
  const rest = rig.rest.get(bone);
  if (!rest) return;
  bone.rotation.set(rest.x + x, rest.y + y, rest.z + z);
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
  const seen = new WeakMap<object, Set<string>>();
  for (const [name, expression] of groups) {
    const kind = classifyVrmExpression(name);
    if (!kind || !expression?.morphTargetBinds?.length) continue;
    for (const bind of expression.morphTargetBinds) {
      const nodeIndex = Number(bind.node);
      const morphIndex = Number(bind.index);
      if (!Number.isInteger(nodeIndex) || !Number.isInteger(morphIndex) || morphIndex < 0) continue;
      const jsonNode = jsonNodes[nodeIndex];
      const nodeName = jsonNode?.name ?? "";
      const meshes = findMorphMeshes(gltf, root, nodeName, nodeIndex, Number(jsonNode?.mesh), morphIndex);
      for (const mesh of meshes) {
        if (!rememberBinding(seen, mesh, `${morphIndex}:${kind}`)) continue;
        bindings.push({ mesh, index: morphIndex, kind, weight: normalizeVrmWeight(bind.weight) });
      }
    }
  }
  return bindings;
}

function collectVrm0BlendShapeBindings(gltf: LoadedGltf, root: import("three").Object3D): MorphBinding[] {
  const groups = gltf.parser?.json?.extensions?.VRM?.blendShapeMaster?.blendShapeGroups ?? [];
  const bindings: MorphBinding[] = [];
  const seen = new WeakMap<object, Set<string>>();
  for (const group of groups) {
    const kind = classifyVrm0Expression(group.presetName || group.name || "");
    if (!kind || !group.binds?.length) continue;
    for (const bind of group.binds) {
      const meshIndex = Number(bind.mesh);
      const morphIndex = Number(bind.index);
      if (!Number.isInteger(meshIndex) || !Number.isInteger(morphIndex) || morphIndex < 0) continue;
      const meshes = findMorphMeshes(gltf, root, gltf.parser?.json?.meshes?.[meshIndex]?.name ?? "", -1, meshIndex, morphIndex);
      for (const mesh of meshes) {
        if (!rememberBinding(seen, mesh, `${morphIndex}:${kind}`)) continue;
        bindings.push({ mesh, index: morphIndex, kind, weight: normalizeVrmWeight(bind.weight) });
      }
    }
  }
  return bindings;
}

function classifyMorph(name: string): { kind: MorphKind; weight: number } | null {
  const n = name.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
  const speechViseme = SPEECH_MORPH_NAMES[n];
  if (speechViseme) return { kind: `speech:${speechViseme}`, weight: SPEECH_MORPH_WEIGHTS[speechViseme] ?? 1 };
  if (n === "mouthclose") return { kind: "speech:sil", weight: 0.22 };
  if (n === "fclmtha") return { kind: "aa", weight: 1 };
  if (n === "fclmthi") return { kind: "ih", weight: 1 };
  if (n === "fclmthu") return { kind: "ou", weight: 1 };
  if (n === "fclmthe") return { kind: "ee", weight: 1 };
  if (n === "fclmtho") return { kind: "oh", weight: 1 };
  if (/blink|eyeblink|まばたき|まばたき左|まばたき右/.test(n)) return { kind: "blink", weight: 1 };
  if (/laugh|laughing/.test(n)) return { kind: "laugh", weight: 0.9 };
  if (/cheeksquint|eyesquint/.test(n)) return { kind: "smile", weight: 0.24 };
  if (/mouthsmile|smile|happy|joy|fun|relaxed|喜|笑/.test(n)) return { kind: "smile", weight: 0.72 };
  if (/browouterup/.test(n)) return { kind: "surprise", weight: 0.48 };
  if (/eyewide/.test(n)) return { kind: "surprise", weight: 0.62 };
  if (/surpris|shocked|驚/.test(n)) return { kind: "surprise", weight: 0.88 };
  if (/browdown/.test(n)) return { kind: "angry", weight: 0.72 };
  if (/nosesneer/.test(n)) return { kind: "angry", weight: 0.34 };
  if (/angry|anger|mad|怒/.test(n)) return { kind: "angry", weight: 0.82 };
  if (/mouthfrown/.test(n)) return { kind: "sad", weight: 0.68 };
  if (/browinnerup/.test(n)) return { kind: "sad", weight: 0.42 };
  if (/sad|sorrow|悲/.test(n)) return { kind: "sad", weight: 0.82 };
  if (/^(mouthopen|jawopen|aah|vowel|あ|い|う|え|お)$/.test(n)) return { kind: "mouth", weight: 0.28 };
  return null;
}

const SPEECH_MORPH_NAMES: Record<string, SpeechViseme> = {
  visemesil: "sil",
  visemepp: "PP",
  visemeff: "FF",
  visemeth: "TH",
  visemedd: "DD",
  visemekk: "kk",
  visemech: "CH",
  visemess: "SS",
  visemenn: "nn",
  visemerr: "RR",
  visemeaa: "aa",
  visemee: "E",
  visemei: "I",
  visemeo: "O",
  visemeu: "U",
};

const SPEECH_MORPH_WEIGHTS: Partial<Record<SpeechViseme, number>> = {
  PP: 0.72,
  FF: 0.68,
  TH: 0.58,
  DD: 0.7,
  kk: 0.72,
  CH: 0.68,
  SS: 0.62,
  nn: 0.68,
  RR: 0.66,
  aa: 0.76,
  E: 0.68,
  I: 0.66,
  O: 0.74,
  U: 0.7,
};

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

function findMorphMeshes(
  gltf: LoadedGltf,
  root: import("three").Object3D,
  nodeName: string,
  nodeIndex: number,
  meshIndex: number,
  morphIndex: number,
): MorphMesh[] {
  const associations = gltf.parser?.associations;
  const associated: MorphMesh[] = [];
  const exact: MorphMesh[] = [];
  const normalized: MorphMesh[] = [];
  const target = normalizeNodeName(nodeName);
  root.traverse((node) => {
    const mesh = node as MorphMesh;
    if (!mesh.morphTargetInfluences || morphIndex >= mesh.morphTargetInfluences.length) return;
    const association = associations?.get(node);
    if ((nodeIndex >= 0 && association?.nodes === nodeIndex) || (Number.isInteger(meshIndex) && meshIndex >= 0 && association?.meshes === meshIndex)) {
      associated.push(mesh);
      return;
    }
    if (nodeName && mesh.name === nodeName) {
      exact.push(mesh);
      return;
    }
    if (target && normalizeNodeName(mesh.name ?? "") === target) {
      normalized.push(mesh);
    }
  });
  return uniqueMorphMeshes(associated.length ? associated : exact.length ? exact : normalized);
}

function uniqueMorphMeshes(meshes: MorphMesh[]): MorphMesh[] {
  return [...new Set(meshes)];
}

function rememberBinding(seen: WeakMap<object, Set<string>>, mesh: MorphMesh, key: string): boolean {
  const object = mesh as object;
  const keys = seen.get(object) ?? new Set<string>();
  if (keys.has(key)) return false;
  keys.add(key);
  seen.set(object, keys);
  return true;
}

function createVrmExpressionDriver(manager: VrmExpressionManagerRuntime | undefined): VrmExpressionDriver | null {
  if (!manager?.expressions?.length) return null;
  return { manager, names: new Set(manager.expressions.map((expression) => expression.expressionName)) };
}

function applyVrmExpressions(driver: VrmExpressionDriver, frame: AvatarFrame) {
  for (const name of driver.names) driver.manager.setValue(name, 0);
  const set = (name: string, value: number) => {
    if (driver.names.has(name)) driver.manager.setValue(name, Math.max(0, Math.min(1, value)));
  };
  const openConsonant = Math.max(frame.speechViseme.TH, frame.speechViseme.DD, frame.speechViseme.kk, frame.speechViseme.RR) * 0.22;
  const narrowConsonant = Math.max(frame.speechViseme.FF, frame.speechViseme.CH, frame.speechViseme.SS, frame.speechViseme.nn) * 0.2;
  set("aa", Math.max(morphValue("aa", frame), openConsonant));
  set("ih", Math.max(morphValue("ih", frame), narrowConsonant));
  set("ou", morphValue("ou", frame));
  set("ee", morphValue("ee", frame));
  set("oh", morphValue("oh", frame));
  set("blink", morphValue("blink", frame));
  set("happy", frame.smile * 1.1 + frame.laugh * 0.72);
  set("laugh", morphValue("laugh", frame));
  set("surprised", morphValue("surprise", frame));
  set("angry", morphValue("angry", frame));
  set("sad", morphValue("sad", frame));
  set("relaxed", morphValue("relaxed", frame));
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
  if (kind.startsWith("speech:")) {
    return frame.speechViseme[kind.slice("speech:".length) as SpeechViseme] ?? 0;
  }
  switch (kind) {
    case "mouth":
      return Math.min(1, frame.mouth + frame.laugh * 0.18 + frame.surprise * 0.2);
    case "aa":
      return Math.min(1, Math.max(frame.viseme.aa, frame.mouth * 0.28) + frame.laugh * 0.22);
    case "ih":
      return Math.min(1, Math.max(frame.viseme.ih, frame.mouth * 0.08) + frame.whisper * 0.16);
    case "ou":
      return Math.min(1, Math.max(frame.viseme.ou, frame.mouth * 0.08) + frame.surprise * 0.14);
    case "ee":
      return Math.min(1, Math.max(frame.viseme.ee, frame.mouth * 0.08) + frame.smile * 0.1);
    case "oh":
      return Math.min(1, Math.max(frame.viseme.oh, frame.mouth * 0.08) + frame.surprise * 0.45);
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
      return Math.min(1, frame.whisper * 0.35 + frame.smile * 0.48);
  }
  return 0;
}
