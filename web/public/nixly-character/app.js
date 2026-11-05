import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { NixlyCharacter } from './character-builder.js';
import { CharacterAnimator } from './character-animator.js';

let scene, camera, renderer, controls;
let character, animator;
let clock;
let currentEnv = 'stairwell';
let stairwellEnvironmentGroup;
let lights = {};

// Camera preset positions
const CAMERA_PRESETS = {
  full: { pos: new THREE.Vector3(0.25, 1.15, 3.15), target: new THREE.Vector3(0, 0.95, 0) },
  portrait: { pos: new THREE.Vector3(0.08, 1.74, 0.82), target: new THREE.Vector3(0, 1.68, 0) },
  profile: { pos: new THREE.Vector3(2.5, 1.15, 0), target: new THREE.Vector3(0, 0.95, 0) },
  top34: { pos: new THREE.Vector3(1.8, 1.9, 2.0), target: new THREE.Vector3(0, 0.95, 0) },
};

export function initApp() {
  const container = document.getElementById('canvas-container');
  clock = new THREE.Clock();

  // 1. Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1F2228);

  // 2. Camera
  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 50);
  camera.position.copy(CAMERA_PRESETS.full.pos);

  // 3. Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // 4. Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.copy(CAMERA_PRESETS.full.target);
  controls.maxDistance = 6.0;
  controls.minDistance = 0.3;
  controls.maxPolarAngle = Math.PI / 2 + 0.05;

  // 5. Environment & Lights
  setupLighting();
  buildStairwellScene();

  // 6. Character & Animator
  character = new NixlyCharacter();
  scene.add(character.group);
  animator = new CharacterAnimator(character);

  // Default to carry or idle
  animator.setClip('idle');

  // 7. Event Listeners
  window.addEventListener('resize', onWindowResize);
  setupUI();

  // 8. Start Loop
  animate();
}

function setupLighting() {
  lights.ambient = new THREE.AmbientLight(0xFFFFFF, 0.5);
  scene.add(lights.ambient);

  lights.mainDir = new THREE.DirectionalLight(0xFFF2E0, 1.2);
  lights.mainDir.position.set(2.5, 4.0, 3.0);
  lights.mainDir.castShadow = true;
  lights.mainDir.shadow.mapSize.width = 2048;
  lights.mainDir.shadow.mapSize.height = 2048;
  lights.mainDir.shadow.camera.near = 0.5;
  lights.mainDir.shadow.camera.far = 12;
  lights.mainDir.shadow.camera.left = -2;
  lights.mainDir.shadow.camera.right = 2;
  lights.mainDir.shadow.camera.top = 2.5;
  lights.mainDir.shadow.camera.bottom = -0.5;
  lights.mainDir.shadow.bias = -0.0005;
  scene.add(lights.mainDir);

  lights.fillDir = new THREE.DirectionalLight(0x8AB4F8, 0.4);
  lights.fillDir.position.set(-3, 2, -2);
  scene.add(lights.fillDir);

  lights.rim = new THREE.DirectionalLight(0xFFFFFF, 0.6);
  lights.rim.position.set(0, 3, -3);
  scene.add(lights.rim);

  applyEnvironmentPreset('stairwell');
}

function buildStairwellScene() {
  stairwellEnvironmentGroup = new THREE.Group();
  stairwellEnvironmentGroup.name = 'StairwellEnvironment';

  // Floor landing
  const floorGeom = new THREE.BoxGeometry(4.5, 0.2, 4.5);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x484B50,
    roughness: 0.9,
    metalness: 0.05
  });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  stairwellEnvironmentGroup.add(floor);

  // Staircase steps in background
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x3E4247, roughness: 0.85 });
  const yellowEdgeMat = new THREE.MeshStandardMaterial({ color: 0xD4A017, roughness: 0.6 });

  for (let i = 0; i < 6; i++) {
    const stepGeom = new THREE.BoxGeometry(1.6, 0.16, 0.32);
    const step = new THREE.Mesh(stepGeom, stepMat);
    step.position.set(0, (i + 1) * 0.16 - 0.08, -1.2 - i * 0.32);
    step.castShadow = true;
    step.receiveShadow = true;
    stairwellEnvironmentGroup.add(step);

    // Yellow warning safety stripe on edge
    const stripeGeom = new THREE.BoxGeometry(1.6, 0.015, 0.04);
    const stripe = new THREE.Mesh(stripeGeom, yellowEdgeMat);
    stripe.position.set(0, (i + 1) * 0.16 + 0.005, -1.2 - i * 0.32 + 0.14);
    stairwellEnvironmentGroup.add(stripe);
  }

  // Yellow Handrail on side
  const railMat = new THREE.MeshStandardMaterial({ color: 0xDAA520, roughness: 0.4, metalness: 0.3 });
  const railGeom = new THREE.CylinderGeometry(0.025, 0.025, 3.2, 8);
  railGeom.rotateX(0.46);
  const rail = new THREE.Mesh(railGeom, railMat);
  rail.position.set(0.85, 1.1, -1.8);
  stairwellEnvironmentGroup.add(rail);

  // Wall in background
  const wallGeom = new THREE.BoxGeometry(5.0, 4.0, 0.1);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x62666B, roughness: 0.95 });
  const wall = new THREE.Mesh(wallGeom, wallMat);
  wall.position.set(0, 2.0, -3.2);
  wall.receiveShadow = true;
  stairwellEnvironmentGroup.add(wall);

  // "STAIR A - FLOOR 61" Sign from the video
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256;
  signCanvas.height = 192;
  const sCtx = signCanvas.getContext('2d');
  sCtx.fillStyle = '#E5E7EB';
  sCtx.fillRect(0, 0, 256, 192);
  sCtx.strokeStyle = '#1F2937';
  sCtx.lineWidth = 8;
  sCtx.strokeRect(6, 6, 244, 180);
  sCtx.fillStyle = '#111827';
  sCtx.font = 'bold 26px sans-serif';
  sCtx.textAlign = 'center';
  sCtx.fillText('STAIR A', 128, 48);
  sCtx.font = 'bold 20px sans-serif';
  sCtx.fillText('FLOOR 61', 128, 88);
  sCtx.font = '14px sans-serif';
  sCtx.fillText('NO ROOF ACCESS', 128, 122);
  sCtx.fillStyle = '#DC2626';
  sCtx.fillText('EXIT AT LEVEL 1', 128, 155);

  const signTex = new THREE.CanvasTexture(signCanvas);
  const signGeom = new THREE.PlaneGeometry(0.64, 0.48);
  const signMesh = new THREE.Mesh(signGeom, new THREE.MeshBasicMaterial({ map: signTex }));
  signMesh.position.set(0, 2.2, -3.14);
  stairwellEnvironmentGroup.add(signMesh);

  scene.add(stairwellEnvironmentGroup);
}

export function applyEnvironmentPreset(preset) {
  currentEnv = preset;
  if (preset === 'stairwell') {
    // Dim, smoky, emergency atmosphere matching video
    scene.background = new THREE.Color(0x2B2D31);
    scene.fog = new THREE.Fog(0x3A3C42, 3, 14);
    lights.ambient.color.set(0x7A746A);
    lights.ambient.intensity = 0.65;
    lights.mainDir.color.set(0xE8D5B5); // warm emergency beam
    lights.mainDir.intensity = 1.0;
    lights.mainDir.position.set(0, 4.0, 1.0);
    lights.fillDir.intensity = 0.25;
    lights.rim.intensity = 0.3;
    if (stairwellEnvironmentGroup) stairwellEnvironmentGroup.visible = true;
  } else if (preset === 'studio') {
    // Neutral bright clean studio for inspecting 3D model
    scene.background = new THREE.Color(0x18191D);
    scene.fog = null;
    lights.ambient.color.set(0xFFFFFF);
    lights.ambient.intensity = 0.55;
    lights.mainDir.color.set(0xFFFFFF);
    lights.mainDir.intensity = 1.3;
    lights.mainDir.position.set(2.5, 4.0, 3.0);
    lights.fillDir.intensity = 0.5;
    lights.rim.intensity = 0.7;
    if (stairwellEnvironmentGroup) stairwellEnvironmentGroup.visible = false;
  } else if (preset === 'daylight') {
    // NYC Church St bright sunlight
    scene.background = new THREE.Color(0x7EA5D8);
    scene.fog = new THREE.Fog(0x8AB5E8, 10, 35);
    lights.ambient.color.set(0xB8D4F0);
    lights.ambient.intensity = 0.7;
    lights.mainDir.color.set(0xFFF5E4);
    lights.mainDir.intensity = 1.6;
    lights.mainDir.position.set(4.0, 6.0, 3.5);
    lights.fillDir.intensity = 0.4;
    lights.rim.intensity = 0.5;
    if (stairwellEnvironmentGroup) stairwellEnvironmentGroup.visible = false;
  }
}

function setCameraView(presetKey) {
  const p = CAMERA_PRESETS[presetKey];
  if (!p) return;

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = p.pos.clone();
  const endTarget = p.target.clone();

  let progress = 0;
  const duration = 400; // ms
  const startTime = performance.now();

  function step(now) {
    progress = Math.min(1, (now - startTime) / duration);
    const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
    camera.position.lerpVectors(startPos, endPos, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    controls.update();
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

// 9. EXPORTERS
export function exportToGLB() {
  const exporter = new GLTFExporter();
  // We export the character group
  const exportTarget = character.group;

  exporter.parse(
    exportTarget,
    (gltf) => {
      const blob = new Blob([gltf], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nixly-character-${character.options.hairStyle || 'hero'}.glb`;
      a.click();
      URL.revokeObjectURL(url);
    },
    (err) => {
      console.error('GLTF Export Error:', err);
      alert('Ошибка при экспорте GLTF: ' + err.message);
    },
    { binary: true, embedImages: true }
  );
}

export function exportToOBJ() {
  const exporter = new OBJExporter();
  const result = exporter.parse(character.group);
  const blob = new Blob([result], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nixly-character.obj';
  a.click();
  URL.revokeObjectURL(url);
}

export function takeScreenshot() {
  renderer.render(scene, camera);
  const dataURL = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = 'nixly-character-screenshot.png';
  a.click();
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  if (!container) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function setupUI() {
  // Preset Buttons
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const presetKey = btn.dataset.preset;
      character.applyPreset(presetKey);
      syncUIWithCharacter();
    });
  });

  // Animation Buttons
  document.querySelectorAll('[data-anim]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-anim]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      animator.setClip(btn.dataset.anim);
      syncUIWithCharacter();
    });
  });

  // Camera views
  document.querySelectorAll('[data-cam]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-cam]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setCameraView(btn.dataset.cam);
    });
  });

  // Environment buttons
  document.querySelectorAll('[data-env]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-env]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyEnvironmentPreset(btn.dataset.env);
    });
  });

  // Speed slider
  const speedSlider = document.getElementById('anim-speed');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      animator.setSpeed(val);
      document.getElementById('anim-speed-val').textContent = val.toFixed(1) + 'x';
    });
  }

  // Play/Pause
  const playBtn = document.getElementById('btn-play-pause');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      animator.isPlaying = !animator.isPlaying;
      playBtn.textContent = animator.isPlaying ? 'Пауза' : 'Пуск';
      playBtn.classList.toggle('btn-warning', !animator.isPlaying);
    });
  }

  // Bandana Toggle
  const bandanaToggle = document.getElementById('opt-bandana');
  if (bandanaToggle) {
    bandanaToggle.addEventListener('change', (e) => {
      character.setOption('hasBandana', e.target.checked);
    });
  }

  // Companion Toggle
  const compToggle = document.getElementById('opt-companion');
  if (compToggle) {
    compToggle.addEventListener('change', (e) => {
      character.setOption('showCompanion', e.target.checked);
    });
  }

  // Tie Toggle
  const tieToggle = document.getElementById('opt-tie');
  if (tieToggle) {
    tieToggle.addEventListener('change', (e) => {
      character.setOption('hasTie', e.target.checked);
    });
  }

  // Badge Toggle
  const badgeToggle = document.getElementById('opt-badge');
  if (badgeToggle) {
    badgeToggle.addEventListener('change', (e) => {
      character.setOption('hasBadge', e.target.checked);
    });
  }

  // Wireframe Toggle
  const wireToggle = document.getElementById('opt-wireframe');
  if (wireToggle) {
    wireToggle.addEventListener('change', (e) => {
      character.setOption('wireframe', e.target.checked);
    });
  }

  // Phone Frame Guide Toggle
  const frameToggle = document.getElementById('opt-phone-frame');
  if (frameToggle) {
    frameToggle.addEventListener('change', (e) => {
      document.getElementById('phone-frame-overlay').classList.toggle('hidden', !e.target.checked);
    });
  }

  // Color Pickers
  bindColorPicker('col-bandana', 'bandanaColor');
  bindColorPicker('col-shirt', 'shirtColor');
  bindColorPicker('col-pants', 'pantsColor');
  bindColorPicker('col-skin', 'skinColor');
  bindColorPicker('col-hair', 'hairColor');
  bindColorPicker('col-shoes', 'shoesColor');

  // Export Buttons
  document.getElementById('btn-export-glb').addEventListener('click', exportToGLB);
  document.getElementById('btn-export-obj').addEventListener('click', exportToOBJ);
  document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot);
}

function bindColorPicker(elemId, optKey) {
  const el = document.getElementById(elemId);
  if (!el) return;
  el.addEventListener('input', (e) => {
    character.setOption(optKey, e.target.value);
  });
}

function syncUIWithCharacter() {
  const opt = character.options;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const setCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  setCheck('opt-bandana', opt.hasBandana);
  setCheck('opt-companion', opt.showCompanion);
  setCheck('opt-tie', opt.hasTie);
  setCheck('opt-badge', opt.hasBadge);
  setCheck('opt-wireframe', opt.wireframe);

  setVal('col-bandana', opt.bandanaColor);
  setVal('col-shirt', opt.shirtColor);
  setVal('col-pants', opt.pantsColor);
  setVal('col-skin', opt.skinColor);
  setVal('col-hair', opt.hairColor);
  setVal('col-shoes', opt.shoesColor);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (animator) animator.update(delta);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// Auto-boot when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
