import * as THREE from "three";
import type { CharacterConfig, ExpressionId, PoseId } from "./characterTypes";

export type CharacterRig = {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  // Face
  eyes: THREE.Group;
  leftEye: THREE.Mesh;
  rightEye: THREE.Mesh;
  leftPupil: THREE.Mesh;
  rightPupil: THREE.Mesh;
  leftBrow: THREE.Mesh;
  rightBrow: THREE.Mesh;
  mouth: THREE.Mesh;
  // Hair & accessories
  hairGroup: THREE.Group;
  bandanaMesh: THREE.Mesh | null;
  tieMesh: THREE.Mesh | null;
  helmetMesh: THREE.Group | null;
  scbaMesh: THREE.Group | null;
  policeCapMesh: THREE.Group | null;
  badgeMesh: THREE.Mesh | null;
  reflectiveStripes: THREE.Mesh[];
  // Limbs
  leftUpperArm: THREE.Group;
  leftForeArm: THREE.Group;
  leftHand: THREE.Group;
  rightUpperArm: THREE.Group;
  rightForeArm: THREE.Group;
  rightHand: THREE.Group;
  leftUpperLeg: THREE.Group;
  leftLowerLeg: THREE.Group;
  leftFoot: THREE.Group;
  rightUpperLeg: THREE.Group;
  rightLowerLeg: THREE.Group;
  rightFoot: THREE.Group;
  // Update & controls
  applyPose: (poseId: PoseId) => void;
  applyExpression: (expressionId: ExpressionId) => void;
  updateAnimation: (time: number, delta: number) => void;
  currentPose: PoseId;
  currentExpression: ExpressionId;
};

// Procedural bandana texture generator (Red with white paisley / geometric dots)
function createBandanaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#b91c1c";
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 3;

    // Outer border
    ctx.strokeRect(16, 16, 224, 224);
    ctx.strokeRect(28, 28, 200, 200);

    // Decorative diamond pattern
    const step = 32;
    for (let x = 48; x < 220; x += step) {
      for (let y = 48; y < 220; y += step) {
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 6, y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const bandanaTextureCache = typeof document !== "undefined" ? createBandanaTexture() : null;

export function buildCharacterModel(config: CharacterConfig): CharacterRig {
  const root = new THREE.Group();
  root.name = `character_${config.id}`;

  // Stylized PBR materials matching video aesthetic (matte low-poly look)
  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.skinColor),
    roughness: 0.65,
    metalness: 0.05,
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.hairColor),
    roughness: 0.8,
    metalness: 0.0,
  });

  const shirtMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.shirtColor),
    roughness: 0.7,
    metalness: 0.0,
  });

  const pantsMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.pantsColor),
    roughness: 0.8,
    metalness: 0.0,
  });

  const shoesMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.shoesColor),
    roughness: 0.5,
    metalness: 0.1,
  });

  const eyeWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.0,
  });

  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.3,
    metalness: 0.0,
  });

  const browMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.hairColor),
    roughness: 0.8,
  });

  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0x240909,
    roughness: 0.5,
  });

  const reflectiveMat = new THREE.MeshStandardMaterial({
    color: 0xd9f944,
    roughness: 0.2,
    emissive: 0x6e8418,
    emissiveIntensity: 0.35,
  });

  // HIERARCHY
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  root.add(hips);

  // Pelvis mesh
  const pelvisGeom = new THREE.BoxGeometry(0.34, 0.18, 0.22);
  const pelvisMesh = new THREE.Mesh(pelvisGeom, pantsMat);
  hips.add(pelvisMesh);

  // Belt
  const beltGeom = new THREE.BoxGeometry(0.35, 0.05, 0.23);
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.4 });
  const beltMesh = new THREE.Mesh(beltGeom, beltMat);
  beltMesh.position.y = 0.07;
  hips.add(beltMesh);

  // Belt buckle
  const buckleGeom = new THREE.BoxGeometry(0.06, 0.04, 0.02);
  const buckleMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.2 });
  const buckleMesh = new THREE.Mesh(buckleGeom, buckleMat);
  buckleMesh.position.set(0, 0.07, 0.12);
  hips.add(buckleMesh);

  // Spine
  const spine = new THREE.Group();
  spine.position.y = 0.1;
  hips.add(spine);

  const waistGeom = new THREE.BoxGeometry(0.32, 0.14, 0.2);
  const waistMesh = new THREE.Mesh(waistGeom, shirtMat);
  waistMesh.position.y = 0.07;
  spine.add(waistMesh);

  // Chest
  const chest = new THREE.Group();
  chest.position.y = 0.14;
  spine.add(chest);

  const chestWidth = config.gender === "female" ? 0.35 : 0.38;
  const chestGeom = new THREE.BoxGeometry(chestWidth, 0.28, 0.23);
  const chestMesh = new THREE.Mesh(chestGeom, shirtMat);
  chestMesh.position.y = 0.14;
  chest.add(chestMesh);

  // Collar points (stylized dress shirt collar)
  const collarMat = shirtMat;
  const leftCollar = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), collarMat);
  leftCollar.rotation.set(0, 0, -Math.PI / 4);
  leftCollar.position.set(-0.06, 0.27, 0.12);
  chest.add(leftCollar);

  const rightCollar = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), collarMat);
  rightCollar.rotation.set(0, 0, Math.PI / 4);
  rightCollar.position.set(0.06, 0.27, 0.12);
  chest.add(rightCollar);

  // Neck
  const neck = new THREE.Group();
  neck.position.y = 0.28;
  chest.add(neck);

  const neckGeom = new THREE.CylinderGeometry(0.065, 0.075, 0.1, 8);
  const neckMesh = new THREE.Mesh(neckGeom, skinMat);
  neckMesh.position.y = 0.05;
  neck.add(neckMesh);

  // Head
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);

  // Stylized head mesh
  const headGeom = new THREE.BoxGeometry(0.24, 0.28, 0.24);
  const headMesh = new THREE.Mesh(headGeom, skinMat);
  headMesh.position.y = 0.14;
  head.add(headMesh);

  // Nose
  const noseGeom = new THREE.BoxGeometry(0.035, 0.06, 0.05);
  const noseMesh = new THREE.Mesh(noseGeom, skinMat);
  noseMesh.position.set(0, 0.13, 0.14);
  head.add(noseMesh);

  // Ears
  const earGeom = new THREE.BoxGeometry(0.03, 0.06, 0.04);
  const leftEar = new THREE.Mesh(earGeom, skinMat);
  leftEar.position.set(-0.13, 0.14, 0);
  const rightEar = new THREE.Mesh(earGeom, skinMat);
  rightEar.position.set(0.13, 0.14, 0);
  head.add(leftEar, rightEar);

  // Eyes
  const eyes = new THREE.Group();
  head.add(eyes);

  const eyeGeom = new THREE.SphereGeometry(0.038, 12, 10);
  const pupilGeom = new THREE.SphereGeometry(0.02, 10, 8);
  const catchlightGeom = new THREE.SphereGeometry(0.007, 6, 6);
  const catchlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Left eye
  const leftEye = new THREE.Mesh(eyeGeom, eyeWhiteMat);
  leftEye.scale.set(1.0, 1.1, 0.5);
  leftEye.position.set(-0.065, 0.165, 0.115);

  const leftPupil = new THREE.Mesh(pupilGeom, pupilMat);
  leftPupil.position.set(0, 0, 0.025);
  const leftCatchlight = new THREE.Mesh(catchlightGeom, catchlightMat);
  leftCatchlight.position.set(0.008, 0.008, 0.036);
  leftEye.add(leftPupil, leftCatchlight);

  // Right eye
  const rightEye = new THREE.Mesh(eyeGeom, eyeWhiteMat);
  rightEye.scale.set(1.0, 1.1, 0.5);
  rightEye.position.set(0.065, 0.165, 0.115);

  const rightPupil = new THREE.Mesh(pupilGeom, pupilMat);
  rightPupil.position.set(0, 0, 0.025);
  const rightCatchlight = new THREE.Mesh(catchlightGeom, catchlightMat);
  rightCatchlight.position.set(0.008, 0.008, 0.036);
  rightEye.add(rightPupil, rightCatchlight);

  eyes.add(leftEye, rightEye);

  // Eyebrows
  const browGeom = new THREE.BoxGeometry(0.065, 0.018, 0.02);
  const leftBrow = new THREE.Mesh(browGeom, browMat);
  leftBrow.position.set(-0.065, 0.22, 0.13);
  const rightBrow = new THREE.Mesh(browGeom, browMat);
  rightBrow.position.set(0.065, 0.22, 0.13);
  head.add(leftBrow, rightBrow);

  // Mouth
  const mouthGeom = new THREE.BoxGeometry(0.08, 0.025, 0.02);
  const mouth = new THREE.Mesh(mouthGeom, mouthMat);
  mouth.position.set(0, 0.065, 0.13);
  head.add(mouth);

  // Hair
  const hairGroup = new THREE.Group();
  head.add(hairGroup);
  buildHair(hairGroup, config.hairStyle, hairMat);

  // ACCESSORIES
  let bandanaMesh: THREE.Mesh | null = null;
  if (config.accessories.bandana) {
    const bandanaMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.accessories.bandanaColor),
      roughness: 0.7,
      map: bandanaTextureCache,
    });
    // Bandana triangular mask covering lower face and wrapping to back of head
    const bandanaGeom = new THREE.CylinderGeometry(0.135, 0.125, 0.16, 12, 1, true, -Math.PI * 0.75, Math.PI * 1.5);
    bandanaMesh = new THREE.Mesh(bandanaGeom, bandanaMat);
    bandanaMesh.position.set(0, 0.09, 0.02);
    // Front knot / tip
    const knotGeom = new THREE.ConeGeometry(0.06, 0.1, 4);
    const knot = new THREE.Mesh(knotGeom, bandanaMat);
    knot.rotation.x = Math.PI;
    knot.position.set(0, -0.06, 0.12);
    bandanaMesh.add(knot);

    head.add(bandanaMesh);
  }

  let tieMesh: THREE.Mesh | null = null;
  if (config.accessories.necktie) {
    const tieMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(config.accessories.necktieColor),
      roughness: 0.5,
    });
    const tieGroup = new THREE.Group();
    // Knot
    const knotGeom = new THREE.ConeGeometry(0.035, 0.045, 4);
    const knot = new THREE.Mesh(knotGeom, tieMat);
    knot.rotation.z = Math.PI;
    knot.position.set(0, 0.25, 0.135);
    tieGroup.add(knot);

    // Tie body
    const bodyGeom = new THREE.BoxGeometry(0.05, 0.22, 0.015);
    const body = new THREE.Mesh(bodyGeom, tieMat);
    body.position.set(0, 0.12, 0.13);
    tieGroup.add(body);

    // Tie tip
    const tipGeom = new THREE.ConeGeometry(0.035, 0.05, 3);
    const tip = new THREE.Mesh(tipGeom, tieMat);
    tip.rotation.z = Math.PI;
    tip.position.set(0, -0.01, 0.13);
    tieGroup.add(tip);

    chest.add(tieGroup);
    tieMesh = body;
  }

  const reflectiveStripes: THREE.Mesh[] = [];

  let helmetMesh: THREE.Group | null = null;
  let scbaMesh: THREE.Group | null = null;
  if (config.accessories.firefighterGear) {
    // FDNY Helmet
    helmetMesh = new THREE.Group();
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.4 });
    const brimGeom = new THREE.CylinderGeometry(0.18, 0.22, 0.03, 16);
    const brim = new THREE.Mesh(brimGeom, helmetMat);
    brim.rotation.x = 0.15; // Slanted down in back
    brim.position.set(0, 0.27, -0.02);
    helmetMesh.add(brim);

    const domeGeom = new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const dome = new THREE.Mesh(domeGeom, helmetMat);
    dome.position.set(0, 0.26, 0);
    helmetMesh.add(dome);

    // Front shield / crest
    const shieldGeom = new THREE.BoxGeometry(0.06, 0.08, 0.02);
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.3, roughness: 0.4 });
    const shield = new THREE.Mesh(shieldGeom, shieldMat);
    shield.position.set(0, 0.32, 0.14);
    shield.rotation.x = -0.15;
    helmetMesh.add(shield);

    head.add(helmetMesh);

    // SCBA Tank (on back of chest)
    scbaMesh = new THREE.Group();
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3, metalness: 0.2 });
    const valveMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.2 });
    const harnessMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });

    const cylinderGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.34, 12);
    const cylinder = new THREE.Mesh(cylinderGeom, tankMat);
    cylinder.position.set(0, 0.15, -0.19);
    scbaMesh.add(cylinder);

    const valveGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8);
    const valve = new THREE.Mesh(valveGeom, valveMat);
    valve.position.set(0, 0.34, -0.19);
    scbaMesh.add(valve);

    // Harness straps over shoulders
    const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.02), harnessMat);
    strapL.position.set(-0.11, 0.14, 0.12);
    const strapR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.02), harnessMat);
    strapR.position.set(0.11, 0.14, 0.12);
    scbaMesh.add(strapL, strapR);

    chest.add(scbaMesh);

    // Reflective stripes on chest & waist
    const stripeChest = new THREE.Mesh(new THREE.BoxGeometry(chestWidth + 0.01, 0.035, 0.24), reflectiveMat);
    stripeChest.position.set(0, 0.18, 0);
    chest.add(stripeChest);
    reflectiveStripes.push(stripeChest);

    const stripeHem = new THREE.Mesh(new THREE.BoxGeometry(chestWidth + 0.01, 0.035, 0.24), reflectiveMat);
    stripeHem.position.set(0, 0.02, 0);
    chest.add(stripeHem);
    reflectiveStripes.push(stripeHem);
  }

  let policeCapMesh: THREE.Group | null = null;
  let badgeMesh: THREE.Mesh | null = null;
  if (config.accessories.policeGear) {
    policeCapMesh = new THREE.Group();
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2, metalness: 0.5 });
    const badgeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });

    // Crown
    const crownGeom = new THREE.CylinderGeometry(0.15, 0.13, 0.08, 8);
    const crown = new THREE.Mesh(crownGeom, capMat);
    crown.position.set(0, 0.3, 0);
    policeCapMesh.add(crown);

    // Visor / Peak
    const visorGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12, 1, false, 0, Math.PI);
    const visor = new THREE.Mesh(visorGeom, visorMat);
    visor.position.set(0, 0.26, 0.08);
    visor.rotation.x = 0.2;
    policeCapMesh.add(visor);

    // Gold badge on cap
    const capBadge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.01), badgeMat);
    capBadge.position.set(0, 0.31, 0.14);
    policeCapMesh.add(capBadge);

    head.add(policeCapMesh);

    // Chest badge
    badgeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.015), badgeMat);
    badgeMesh.position.set(-0.11, 0.2, 0.125);
    chest.add(badgeMesh);

    // Duty belt holster
    const holsterMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.5 });
    const holster = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), holsterMat);
    holster.position.set(0.19, 0.04, 0);
    hips.add(holster);
  }

  // LIMBS - ARMS
  const armRadius = 0.05;

  // Left Arm
  const leftUpperArm = new THREE.Group();
  leftUpperArm.position.set(-(chestWidth / 2 + 0.05), 0.24, 0);
  chest.add(leftUpperArm);

  const leftUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(armRadius, armRadius, 0.26, 8), shirtMat);
  leftUpperArmMesh.position.y = -0.13;
  leftUpperArm.add(leftUpperArmMesh);

  const leftForeArm = new THREE.Group();
  leftForeArm.position.y = -0.26;
  leftUpperArm.add(leftForeArm);

  const leftForeArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(armRadius * 0.9, armRadius * 0.8, 0.24, 8), shirtMat);
  leftForeArmMesh.position.y = -0.12;
  leftForeArm.add(leftForeArmMesh);

  if (config.accessories.firefighterGear) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(armRadius * 0.95, armRadius * 0.85, 0.03, 8), reflectiveMat);
    stripe.position.y = -0.12;
    leftForeArm.add(stripe);
    reflectiveStripes.push(stripe);
  }

  const leftHand = new THREE.Group();
  leftHand.position.y = -0.24;
  leftForeArm.add(leftHand);

  const handMat = config.accessories.firefighterGear ? new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.8 }) : skinMat;
  const leftHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.08, 0.045), handMat);
  leftHandMesh.position.y = -0.04;
  leftHand.add(leftHandMesh);

  // Right Arm
  const rightUpperArm = new THREE.Group();
  rightUpperArm.position.set(chestWidth / 2 + 0.05, 0.24, 0);
  chest.add(rightUpperArm);

  const rightUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(armRadius, armRadius, 0.26, 8), shirtMat);
  rightUpperArmMesh.position.y = -0.13;
  rightUpperArm.add(rightUpperArmMesh);

  const rightForeArm = new THREE.Group();
  rightForeArm.position.y = -0.26;
  rightUpperArm.add(rightForeArm);

  const rightForeArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(armRadius * 0.9, armRadius * 0.8, 0.24, 8), shirtMat);
  rightForeArmMesh.position.y = -0.12;
  rightForeArm.add(rightForeArmMesh);

  if (config.accessories.firefighterGear) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(armRadius * 0.95, armRadius * 0.85, 0.03, 8), reflectiveMat);
    stripe.position.y = -0.12;
    rightForeArm.add(stripe);
    reflectiveStripes.push(stripe);
  }

  const rightHand = new THREE.Group();
  rightHand.position.y = -0.24;
  rightForeArm.add(rightHand);

  const rightHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.08, 0.045), handMat);
  rightHandMesh.position.y = -0.04;
  rightHand.add(rightHandMesh);

  // LIMBS - LEGS
  const legRadius = 0.065;

  // Left Leg
  const leftUpperLeg = new THREE.Group();
  leftUpperLeg.position.set(-0.1, -0.08, 0);
  hips.add(leftUpperLeg);

  const leftUpperLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(legRadius, legRadius * 0.9, 0.42, 8), pantsMat);
  leftUpperLegMesh.position.y = -0.21;
  leftUpperLeg.add(leftUpperLegMesh);

  const leftLowerLeg = new THREE.Group();
  leftLowerLeg.position.y = -0.42;
  leftUpperLeg.add(leftLowerLeg);

  const leftLowerLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(legRadius * 0.9, legRadius * 0.8, 0.4, 8), pantsMat);
  leftLowerLegMesh.position.y = -0.2;
  leftLowerLeg.add(leftLowerLegMesh);

  if (config.accessories.firefighterGear) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(legRadius * 0.95, legRadius * 0.85, 0.035, 8), reflectiveMat);
    stripe.position.y = -0.32;
    leftLowerLeg.add(stripe);
    reflectiveStripes.push(stripe);
  }

  const leftFoot = new THREE.Group();
  leftFoot.position.y = -0.4;
  leftLowerLeg.add(leftFoot);

  const leftFootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.2), shoesMat);
  leftFootMesh.position.set(0, -0.04, 0.04);
  leftFoot.add(leftFootMesh);

  // Right Leg
  const rightUpperLeg = new THREE.Group();
  rightUpperLeg.position.set(0.1, -0.08, 0);
  hips.add(rightUpperLeg);

  const rightUpperLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(legRadius, legRadius * 0.9, 0.42, 8), pantsMat);
  rightUpperLegMesh.position.y = -0.21;
  rightUpperLeg.add(rightUpperLegMesh);

  const rightLowerLeg = new THREE.Group();
  rightLowerLeg.position.y = -0.42;
  rightUpperLeg.add(rightLowerLeg);

  const rightLowerLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(legRadius * 0.9, legRadius * 0.8, 0.4, 8), pantsMat);
  rightLowerLegMesh.position.y = -0.2;
  rightLowerLeg.add(rightLowerLegMesh);

  if (config.accessories.firefighterGear) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(legRadius * 0.95, legRadius * 0.85, 0.035, 8), reflectiveMat);
    stripe.position.y = -0.32;
    rightLowerLeg.add(stripe);
    reflectiveStripes.push(stripe);
  }

  const rightFoot = new THREE.Group();
  rightFoot.position.y = -0.4;
  rightLowerLeg.add(rightFoot);

  const rightFootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.2), shoesMat);
  rightFootMesh.position.set(0, -0.04, 0.04);
  rightFoot.add(rightFootMesh);

  // Helper to reset all joints to identity/rest
  function resetJoints() {
    hips.position.set(0, 0.95, 0);
    hips.rotation.set(0, 0, 0);
    spine.rotation.set(0, 0, 0);
    chest.rotation.set(0, 0, 0);
    neck.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);

    leftUpperArm.rotation.set(0, 0, 0.1);
    leftForeArm.rotation.set(0, 0, 0);
    leftHand.rotation.set(0, 0, 0);

    rightUpperArm.rotation.set(0, 0, -0.1);
    rightForeArm.rotation.set(0, 0, 0);
    rightHand.rotation.set(0, 0, 0);

    leftUpperLeg.rotation.set(0, 0, 0);
    leftLowerLeg.rotation.set(0, 0, 0);
    leftFoot.rotation.set(0, 0, 0);

    rightUpperLeg.rotation.set(0, 0, 0);
    rightLowerLeg.rotation.set(0, 0, 0);
    rightFoot.rotation.set(0, 0, 0);
  }

  let currentPose: PoseId = "idle-breathe";
  let currentExpression: ExpressionId = "neutral";

  function applyExpression(expr: ExpressionId) {
    currentExpression = expr;
    switch (expr) {
      case "heroic":
        leftBrow.rotation.set(0, 0, -0.18);
        rightBrow.rotation.set(0, 0, 0.18);
        leftBrow.position.y = 0.21;
        rightBrow.position.y = 0.21;
        leftEye.scale.set(1.0, 1.0, 0.5);
        rightEye.scale.set(1.0, 1.0, 0.5);
        mouth.scale.set(0.9, 0.8, 1.0);
        break;

      case "panic":
        leftBrow.rotation.set(0, 0, 0.25);
        rightBrow.rotation.set(0, 0, -0.25);
        leftBrow.position.y = 0.24;
        rightBrow.position.y = 0.24;
        leftEye.scale.set(1.3, 1.3, 0.6);
        rightEye.scale.set(1.3, 1.3, 0.6);
        mouth.scale.set(1.4, 3.2, 1.0); // wide open screaming
        break;

      case "exhausted":
        leftBrow.rotation.set(0, 0, 0.15);
        rightBrow.rotation.set(0, 0, -0.15);
        leftBrow.position.y = 0.21;
        rightBrow.position.y = 0.21;
        leftEye.scale.set(1.0, 0.45, 0.5); // eyes half-shut
        rightEye.scale.set(1.0, 0.45, 0.5);
        mouth.scale.set(0.9, 1.6, 1.0);
        break;

      case "shouting":
        leftBrow.rotation.set(0, 0, -0.12);
        rightBrow.rotation.set(0, 0, 0.12);
        leftBrow.position.y = 0.22;
        rightBrow.position.y = 0.22;
        leftEye.scale.set(1.15, 1.15, 0.5);
        rightEye.scale.set(1.15, 1.15, 0.5);
        mouth.scale.set(1.3, 2.8, 1.0);
        break;

      case "neutral":
      default:
        leftBrow.rotation.set(0, 0, 0);
        rightBrow.rotation.set(0, 0, 0);
        leftBrow.position.y = 0.22;
        rightBrow.position.y = 0.22;
        leftEye.scale.set(1.0, 1.1, 0.5);
        rightEye.scale.set(1.0, 1.1, 0.5);
        mouth.scale.set(1.0, 1.0, 1.0);
        break;
    }
  }

  function applyPose(poseId: PoseId) {
    currentPose = poseId;
    resetJoints();

    switch (poseId) {
      case "hero-point": // Welles at 00:13: "Stairwell A! Follow me! Go! Go!"
        hips.rotation.y = 0.3;
        chest.rotation.y = 0.2;
        chest.rotation.x = 0.1;
        head.rotation.y = -0.4;
        head.rotation.x = -0.05;

        // Right arm pointing forward-up
        rightUpperArm.rotation.set(-1.4, 0.2, 0.3);
        rightForeArm.rotation.set(-0.2, 0, 0);
        rightHand.rotation.set(-0.2, 0, 0);

        // Left arm back for balance
        leftUpperArm.rotation.set(0.4, 0, -0.3);
        leftForeArm.rotation.set(-0.5, 0, 0);

        // Legs stance
        rightUpperLeg.rotation.set(-0.3, 0, 0.1);
        rightLowerLeg.rotation.set(0.4, 0, 0);
        leftUpperLeg.rotation.set(0.25, 0, -0.1);
        leftLowerLeg.rotation.set(0.1, 0, 0);
        applyExpression("heroic");
        break;

      case "carry-piggyback": // Welles at 00:17: carrying woman down stairs
        hips.position.set(0, 0.85, 0);
        hips.rotation.x = 0.35; // Torso leaning forward
        chest.rotation.x = 0.15;
        head.rotation.x = -0.35; // Head raised to see ahead

        // Arms hooked back holding survivor behind
        leftUpperArm.rotation.set(0.65, 0, -0.5);
        leftForeArm.rotation.set(-1.7, 0, 0);
        rightUpperArm.rotation.set(0.65, 0, 0.5);
        rightForeArm.rotation.set(-1.7, 0, 0);

        // Walking down stairs
        leftUpperLeg.rotation.set(-0.55, 0, 0);
        leftLowerLeg.rotation.set(0.85, 0, 0);
        rightUpperLeg.rotation.set(0.45, 0, 0);
        rightLowerLeg.rotation.set(0.2, 0, 0);
        applyExpression("heroic");
        break;

      case "carry-receive": // Floor 61: "Take her! Keep going down!"
        hips.position.set(0, 0.88, 0);
        chest.rotation.x = 0.2;
        head.rotation.x = -0.15;

        // Both arms extended forward to take survivor
        leftUpperArm.rotation.set(-1.1, 0, 0.2);
        leftForeArm.rotation.set(-0.6, 0, 0);
        rightUpperArm.rotation.set(-1.1, 0, -0.2);
        rightForeArm.rotation.set(-0.6, 0, 0);

        leftUpperLeg.rotation.set(0.2, 0, -0.2);
        leftLowerLeg.rotation.set(0.3, 0, 0);
        rightUpperLeg.rotation.set(-0.25, 0, 0.2);
        rightLowerLeg.rotation.set(0.4, 0, 0);
        applyExpression("panic");
        break;

      case "turn-around-stairs": // 00:25: "There are more people up there!"
        hips.rotation.y = 2.7; // Turned almost around
        chest.rotation.y = 0.3;
        head.rotation.set(-0.3, -0.6, 0); // Looking back up

        rightUpperArm.rotation.set(-0.5, 0, 0.4);
        rightForeArm.rotation.set(-0.8, 0, 0);
        leftUpperArm.rotation.set(0.2, 0, -0.3);

        leftUpperLeg.rotation.set(-0.3, 0, 0);
        leftLowerLeg.rotation.set(0.5, 0, 0);
        rightUpperLeg.rotation.set(0.4, 0, 0);
        rightLowerLeg.rotation.set(0.1, 0, 0);
        applyExpression("heroic");
        break;

      case "firefighter-climb": // 00:34: "Forty more! Keep going!"
        hips.position.set(0, 0.9, 0);
        chest.rotation.x = 0.25;
        head.rotation.x = -0.2;

        // Left arm holding stair railing / gesturing up
        leftUpperArm.rotation.set(-1.2, 0.3, -0.2);
        leftForeArm.rotation.set(-0.5, 0, 0);

        // Right arm down holding axe/gear
        rightUpperArm.rotation.set(0.2, 0, 0.2);
        rightForeArm.rotation.set(-0.4, 0, 0);

        // Stepping high up a stair
        leftUpperLeg.rotation.set(-0.75, 0, 0);
        leftLowerLeg.rotation.set(1.1, 0, 0);
        rightUpperLeg.rotation.set(0.3, 0, 0);
        rightLowerLeg.rotation.set(0.1, 0, 0);
        applyExpression("shouting");
        break;

      case "exhausted-slump": // 00:38: "I can't anymore..."
        hips.position.set(0, 0.32, 0); // Sitting on stair step
        hips.rotation.x = 0.2;
        spine.rotation.x = 0.45;
        chest.rotation.x = 0.35;
        head.rotation.x = 0.65; // Head slumped between knees

        leftUpperArm.rotation.set(0.4, 0, -0.2);
        leftForeArm.rotation.set(-1.4, 0, 0);
        rightUpperArm.rotation.set(0.4, 0, 0.2);
        rightForeArm.rotation.set(-1.4, 0, 0);

        // Knees bent high while sitting
        leftUpperLeg.rotation.set(-1.5, 0, -0.2);
        leftLowerLeg.rotation.set(1.9, 0, 0);
        rightUpperLeg.rotation.set(-1.5, 0, 0.2);
        rightLowerLeg.rotation.set(1.9, 0, 0);
        applyExpression("exhausted");
        break;

      case "help-hand": // 00:41: "One step at a time"
        hips.position.set(0, 0.75, 0);
        hips.rotation.x = 0.3;
        chest.rotation.x = 0.35;
        head.rotation.x = -0.25;

        // Right arm reached down to lift person
        rightUpperArm.rotation.set(-0.8, 0, 0.2);
        rightForeArm.rotation.set(-0.3, 0, 0);
        rightHand.rotation.set(-0.3, 0, 0);

        leftUpperArm.rotation.set(0.2, 0, -0.3);
        leftForeArm.rotation.set(-0.4, 0, 0);

        leftUpperLeg.rotation.set(-0.55, 0, 0);
        leftLowerLeg.rotation.set(0.85, 0, 0);
        rightUpperLeg.rotation.set(0.3, 0, 0);
        rightLowerLeg.rotation.set(0.4, 0, 0);
        applyExpression("heroic");
        break;

      case "police-direct": // 00:51: "This way! Don't look up!"
        hips.rotation.y = -0.4;
        chest.rotation.y = -0.3;
        head.rotation.y = 0.5;

        // Left arm pointing/waving people towards Church St
        leftUpperArm.rotation.set(-1.3, 0, -0.6);
        leftForeArm.rotation.set(-0.3, 0, 0);

        // Right hand resting on belt
        rightUpperArm.rotation.set(0.2, 0, 0.3);
        rightForeArm.rotation.set(-1.3, 0, 0);

        leftUpperLeg.rotation.set(0.1, 0, -0.25);
        rightUpperLeg.rotation.set(-0.1, 0, 0.25);
        applyExpression("shouting");
        break;

      case "panic-run": // 00:58: "It's coming down! RUN!"
        hips.position.set(0, 0.9, 0);
        hips.rotation.x = 0.45;
        chest.rotation.x = 0.2;
        head.rotation.set(-0.4, 0.6, 0); // Looking back at tower

        leftUpperArm.rotation.set(-1.2, 0, -0.4);
        leftForeArm.rotation.set(-1.2, 0, 0);
        rightUpperArm.rotation.set(1.0, 0, 0.4);
        rightForeArm.rotation.set(-0.6, 0, 0);

        leftUpperLeg.rotation.set(-0.9, 0, 0);
        leftLowerLeg.rotation.set(1.2, 0, 0);
        rightUpperLeg.rotation.set(0.8, 0, 0);
        rightLowerLeg.rotation.set(0.3, 0, 0);
        applyExpression("panic");
        break;

      case "run-loop":
        applyExpression("panic");
        break;

      case "idle-breathe":
      default:
        applyExpression("neutral");
        break;
    }
  }

  function updateAnimation(time: number, _delta: number) {
    if (currentPose === "idle-breathe") {
      const breath = Math.sin(time * 2.2) * 0.025;
      chest.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
      hips.position.y = 0.95 + Math.sin(time * 2.2) * 0.006;
      head.rotation.x = Math.sin(time * 1.5) * 0.02;
    } else if (currentPose === "run-loop") {
      const speed = 9.0;
      const legCycle = Math.sin(time * speed);
      const armCycle = -legCycle;

      hips.position.y = 0.92 + Math.abs(Math.sin(time * speed * 2)) * 0.06;
      hips.rotation.x = 0.35;
      chest.rotation.y = armCycle * 0.15;

      leftUpperLeg.rotation.x = legCycle * 0.85;
      leftLowerLeg.rotation.x = legCycle > 0 ? legCycle * 1.1 : 0.15;

      rightUpperLeg.rotation.x = -legCycle * 0.85;
      rightLowerLeg.rotation.x = -legCycle > 0 ? -legCycle * 1.1 : 0.15;

      leftUpperArm.rotation.x = armCycle * 0.9;
      leftForeArm.rotation.x = -0.9 + Math.abs(armCycle) * 0.3;

      rightUpperArm.rotation.x = -armCycle * 0.9;
      rightForeArm.rotation.x = -0.9 + Math.abs(armCycle) * 0.3;
    }
  }

  // Initial pose
  applyPose("idle-breathe");

  return {
    root,
    hips,
    spine,
    chest,
    neck,
    head,
    eyes,
    leftEye,
    rightEye,
    leftPupil,
    rightPupil,
    leftBrow,
    rightBrow,
    mouth,
    hairGroup,
    bandanaMesh,
    tieMesh,
    helmetMesh,
    scbaMesh,
    policeCapMesh,
    badgeMesh,
    reflectiveStripes,
    leftUpperArm,
    leftForeArm,
    leftHand,
    rightUpperArm,
    rightForeArm,
    rightHand,
    leftUpperLeg,
    leftLowerLeg,
    leftFoot,
    rightUpperLeg,
    rightLowerLeg,
    rightFoot,
    applyPose,
    applyExpression,
    updateAnimation,
    get currentPose() {
      return currentPose;
    },
    get currentExpression() {
      return currentExpression;
    },
  };
}

function buildHair(group: THREE.Group, style: CharacterConfig["hairStyle"], material: THREE.Material) {
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }

  switch (style) {
    case "parted": {
      // Welles parted hair: top layer + parted fringe to right side
      const topGeom = new THREE.BoxGeometry(0.26, 0.09, 0.26);
      const top = new THREE.Mesh(topGeom, material);
      top.position.set(0, 0.28, 0);
      group.add(top);

      const partLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), material);
      partLeft.position.set(-0.07, 0.26, 0.12);
      partLeft.rotation.z = -0.15;
      group.add(partLeft);

      const partRight = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.08), material);
      partRight.position.set(0.06, 0.26, 0.12);
      partRight.rotation.z = 0.25;
      group.add(partRight);

      // Back and sides
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.06), material);
      back.position.set(0, 0.18, -0.11);
      group.add(back);
      break;
    }

    case "short": {
      // Classic neat male cut
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.08, 0.255), material);
      top.position.set(0, 0.28, 0);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.14, 0.05), material);
      back.position.set(0, 0.18, -0.11);
      group.add(top, back);
      break;
    }

    case "bob": {
      // Female shoulder/chin-length bob framing face
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.26), material);
      top.position.set(0, 0.28, 0);

      const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.24), material);
      leftSide.position.set(-0.13, 0.16, 0);
      const rightSide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.24), material);
      rightSide.position.set(0.13, 0.16, 0);

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.06), material);
      back.position.set(0, 0.16, -0.11);

      group.add(top, leftSide, rightSide, back);
      break;
    }

    case "cropped": {
      // Crew cut / buzz under helmets
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.04, 0.245), material);
      cap.position.set(0, 0.27, 0);
      group.add(cap);
      break;
    }

    case "bald":
    default:
      // No hair mesh
      break;
  }
}
