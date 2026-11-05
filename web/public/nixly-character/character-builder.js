import * as THREE from 'three';

/**
 * Creates a procedural paisley/dots texture for Welles Crowther's red bandana.
 */
export function createBandanaTexture(baseColor = '#C9232B', dotColor = '#FFFFFF') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base cloth color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 512);

  // Decorative border lines
  ctx.strokeStyle = dotColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, 480, 480);
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, 460, 460);

  // Paisley & dot pattern
  ctx.fillStyle = dotColor;
  const step = 32;
  for (let y = 48; y < 470; y += step) {
    for (let x = 48; x < 470; x += step) {
      const isAlt = ((x + y) / step) % 2 === 0;
      if (isAlt) {
        // Small paisley / floral diamond
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 6, y, 1.5, 0, Math.PI * 2);
        ctx.arc(x - 6, y, 1.5, 0, Math.PI * 2);
        ctx.arc(x, y + 6, 1.5, 0, Math.PI * 2);
        ctx.arc(x, y - 6, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Simple dot
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/**
 * Procedural low-poly Humanoid Character Generator.
 * Matches the Nixly AI / Synty Polygon stylized aesthetic.
 */
export class NixlyCharacter {
  constructor(options = {}) {
    this.options = Object.assign({
      skinColor: '#E2BE9F',
      hairColor: '#422817',
      hairStyle: 'welles', // 'welles' | 'female_long' | 'buzz'
      shirtColor: '#F3F4F6',
      pantsColor: '#262A33',
      shoesColor: '#18191B',
      beltColor: '#1F2024',
      buckleColor: '#C0C5CC',
      hasBandana: true,
      bandanaColor: '#C9232B',
      hasTie: false,
      tieColor: '#3C4550',
      hasBadge: false, // police / guard badge
      showCompanion: false, // piggyback survivor
      wireframe: false,
    }, options);

    this.group = new THREE.Group();
    this.group.name = 'NixlyCharacter_Root';
    this.materials = {};
    this.joints = {};
    this.parts = {};
    this.companion = null;

    this.initMaterials();
    this.buildSkeleton();
    this.buildGeometry();
    this.buildCompanion();

    this.updateVisibility();
  }

  initMaterials() {
    const wf = this.options.wireframe;
    this.materials.skin = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.skinColor),
      roughness: 0.8,
      metalness: 0.05,
      wireframe: wf,
      name: 'SkinMat'
    });

    this.materials.hair = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.hairColor),
      roughness: 0.9,
      metalness: 0.05,
      wireframe: wf,
      name: 'HairMat'
    });

    this.materials.shirt = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.shirtColor),
      roughness: 0.75,
      metalness: 0.02,
      wireframe: wf,
      name: 'ShirtMat'
    });

    this.materials.pants = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.pantsColor),
      roughness: 0.85,
      metalness: 0.02,
      wireframe: wf,
      name: 'PantsMat'
    });

    this.materials.shoes = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.shoesColor),
      roughness: 0.6,
      metalness: 0.1,
      wireframe: wf,
      name: 'ShoesMat'
    });

    this.materials.belt = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.beltColor),
      roughness: 0.7,
      metalness: 0.1,
      wireframe: wf,
      name: 'BeltMat'
    });

    this.materials.buckle = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.buckleColor),
      roughness: 0.3,
      metalness: 0.8,
      wireframe: wf,
      name: 'BuckleMat'
    });

    this.bandanaTex = createBandanaTexture(this.options.bandanaColor);
    this.materials.bandana = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.bandanaColor),
      map: this.bandanaTex,
      roughness: 0.8,
      metalness: 0.02,
      side: THREE.DoubleSide,
      wireframe: wf,
      name: 'BandanaMat'
    });

    this.materials.eyeWhite = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.3,
      wireframe: wf
    });

    this.materials.eyePupil = new THREE.MeshStandardMaterial({
      color: 0x111113,
      roughness: 0.2,
      wireframe: wf
    });

    this.materials.eyebrow = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.hairColor).multiplyScalar(0.7),
      roughness: 0.9,
      wireframe: wf
    });

    this.materials.tie = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.tieColor),
      roughness: 0.7,
      wireframe: wf
    });

    this.materials.badge = new THREE.MeshStandardMaterial({
      color: 0xE6C342,
      roughness: 0.3,
      metalness: 0.85,
      wireframe: wf
    });
  }

  buildSkeleton() {
    // Hierarchical Joints tree
    // Root -> Hips -> Spine -> Chest -> Neck -> Head
    const j = this.joints;

    j.root = new THREE.Group();
    j.root.name = 'Joint_Root';
    this.group.add(j.root);

    j.hips = new THREE.Group();
    j.hips.name = 'Joint_Hips';
    j.hips.position.set(0, 0.96, 0); // ~0.96m above ground
    j.root.add(j.hips);

    j.spine = new THREE.Group();
    j.spine.name = 'Joint_Spine';
    j.spine.position.set(0, 0.12, 0);
    j.hips.add(j.spine);

    j.chest = new THREE.Group();
    j.chest.name = 'Joint_Chest';
    j.chest.position.set(0, 0.20, 0);
    j.spine.add(j.chest);

    j.neck = new THREE.Group();
    j.neck.name = 'Joint_Neck';
    j.neck.position.set(0, 0.28, 0);
    j.chest.add(j.neck);

    j.head = new THREE.Group();
    j.head.name = 'Joint_Head';
    j.head.position.set(0, 0.10, 0);
    j.neck.add(j.head);

    // Left Arm Hierarchy
    j.leftShoulder = new THREE.Group();
    j.leftShoulder.name = 'Joint_LeftShoulder';
    j.leftShoulder.position.set(0.23, 0.22, 0);
    j.chest.add(j.leftShoulder);

    j.leftUpperArm = new THREE.Group();
    j.leftUpperArm.name = 'Joint_LeftUpperArm';
    j.leftShoulder.add(j.leftUpperArm);

    j.leftElbow = new THREE.Group();
    j.leftElbow.name = 'Joint_LeftElbow';
    j.leftElbow.position.set(0, -0.27, 0);
    j.leftUpperArm.add(j.leftElbow);

    j.leftWrist = new THREE.Group();
    j.leftWrist.name = 'Joint_LeftWrist';
    j.leftWrist.position.set(0, -0.24, 0);
    j.leftElbow.add(j.leftWrist);

    // Right Arm Hierarchy
    j.rightShoulder = new THREE.Group();
    j.rightShoulder.name = 'Joint_RightShoulder';
    j.rightShoulder.position.set(-0.23, 0.22, 0);
    j.chest.add(j.rightShoulder);

    j.rightUpperArm = new THREE.Group();
    j.rightUpperArm.name = 'Joint_RightUpperArm';
    j.rightShoulder.add(j.rightUpperArm);

    j.rightElbow = new THREE.Group();
    j.rightElbow.name = 'Joint_RightElbow';
    j.rightElbow.position.set(0, -0.27, 0);
    j.rightUpperArm.add(j.rightElbow);

    j.rightWrist = new THREE.Group();
    j.rightWrist.name = 'Joint_RightWrist';
    j.rightWrist.position.set(0, -0.24, 0);
    j.rightElbow.add(j.rightWrist);

    // Left Leg Hierarchy
    j.leftHip = new THREE.Group();
    j.leftHip.name = 'Joint_LeftHip';
    j.leftHip.position.set(0.105, -0.04, 0);
    j.hips.add(j.leftHip);
    j.leftThigh = j.leftHip;

    j.leftKnee = new THREE.Group();
    j.leftKnee.name = 'Joint_LeftKnee';
    j.leftKnee.position.set(0, -0.42, 0);
    j.leftHip.add(j.leftKnee);

    j.leftAnkle = new THREE.Group();
    j.leftAnkle.name = 'Joint_LeftAnkle';
    j.leftAnkle.position.set(0, -0.42, 0);
    j.leftKnee.add(j.leftAnkle);

    // Right Leg Hierarchy
    j.rightHip = new THREE.Group();
    j.rightHip.name = 'Joint_RightHip';
    j.rightHip.position.set(-0.105, -0.04, 0);
    j.hips.add(j.rightHip);
    j.rightThigh = j.rightHip;

    j.rightKnee = new THREE.Group();
    j.rightKnee.name = 'Joint_RightKnee';
    j.rightKnee.position.set(0, -0.42, 0);
    j.rightHip.add(j.rightKnee);

    j.rightAnkle = new THREE.Group();
    j.rightAnkle.name = 'Joint_RightAnkle';
    j.rightAnkle.position.set(0, -0.42, 0);
    j.rightKnee.add(j.rightAnkle);
  }

  buildGeometry() {
    const j = this.joints;
    const m = this.materials;

    // --- 1. PELVIS & BELT ---
    const pelvisGeom = new THREE.BoxGeometry(0.31, 0.16, 0.22, 2, 1, 1);
    const pelvisMesh = new THREE.Mesh(pelvisGeom, m.pants);
    pelvisMesh.castShadow = true;
    pelvisMesh.receiveShadow = true;
    j.hips.add(pelvisMesh);

    // Belt
    const beltGeom = new THREE.BoxGeometry(0.315, 0.045, 0.225);
    const beltMesh = new THREE.Mesh(beltGeom, m.belt);
    beltMesh.position.y = 0.07;
    j.hips.add(beltMesh);

    // Buckle
    const buckleGeom = new THREE.BoxGeometry(0.065, 0.05, 0.015);
    const buckleMesh = new THREE.Mesh(buckleGeom, m.buckle);
    buckleMesh.position.set(0, 0.07, 0.115);
    j.hips.add(buckleMesh);

    // --- 2. SPINE / ABDOMEN ---
    const abdomenGeom = new THREE.CylinderGeometry(0.14, 0.155, 0.18, 8);
    abdomenGeom.scale(1.15, 1, 0.85);
    const abdomenMesh = new THREE.Mesh(abdomenGeom, m.shirt);
    abdomenMesh.position.y = 0.09;
    abdomenMesh.castShadow = true;
    j.spine.add(abdomenMesh);

    // --- 3. CHEST & SHOULDERS ---
    // Stylized tapered chest
    const chestGeom = new THREE.CylinderGeometry(0.18, 0.145, 0.26, 8);
    chestGeom.scale(1.28, 1, 0.82);
    const chestMesh = new THREE.Mesh(chestGeom, m.shirt);
    chestMesh.position.y = 0.13;
    chestMesh.castShadow = true;
    j.chest.add(chestMesh);

    // Shirt buttons placket
    const placketGeom = new THREE.BoxGeometry(0.035, 0.26, 0.01);
    const placketMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.options.shirtColor).multiplyScalar(0.92),
      roughness: 0.8
    });
    const placketMesh = new THREE.Mesh(placketGeom, placketMat);
    placketMesh.position.set(0, 0.13, 0.115);
    j.chest.add(placketMesh);

    // Optional tie
    this.parts.tie = new THREE.Group();
    const tieKnotGeom = new THREE.ConeGeometry(0.035, 0.05, 4);
    tieKnotGeom.rotateZ(Math.PI);
    const tieKnot = new THREE.Mesh(tieKnotGeom, m.tie);
    tieKnot.position.set(0, 0.26, 0.12);
    this.parts.tie.add(tieKnot);

    const tieBodyGeom = new THREE.BoxGeometry(0.045, 0.26, 0.01);
    const tieBody = new THREE.Mesh(tieBodyGeom, m.tie);
    tieBody.position.set(0, 0.12, 0.122);
    this.parts.tie.add(tieBody);
    j.chest.add(this.parts.tie);

    // Optional Police / Guard Badge
    this.parts.badge = new THREE.Group();
    const badgeGeom = new THREE.CylinderGeometry(0.03, 0.035, 0.01, 6);
    badgeGeom.rotateX(Math.PI / 2);
    const badgeMesh = new THREE.Mesh(badgeGeom, m.badge);
    badgeMesh.position.set(0.12, 0.18, 0.115);
    this.parts.badge.add(badgeMesh);
    j.chest.add(this.parts.badge);

    // --- 4. NECK & COLLAR ---
    const neckGeom = new THREE.CylinderGeometry(0.055, 0.065, 0.10, 8);
    const neckMesh = new THREE.Mesh(neckGeom, m.skin);
    neckMesh.position.y = 0.05;
    j.neck.add(neckMesh);

    // Shirt Collar flaps
    const collarLeftGeom = new THREE.BoxGeometry(0.065, 0.04, 0.015);
    collarLeftGeom.rotateY(0.4);
    const collarLeft = new THREE.Mesh(collarLeftGeom, m.shirt);
    collarLeft.position.set(0.06, 0.05, 0.065);
    j.neck.add(collarLeft);

    const collarRightGeom = new THREE.BoxGeometry(0.065, 0.04, 0.015);
    collarRightGeom.rotateY(-0.4);
    const collarRight = new THREE.Mesh(collarRightGeom, m.shirt);
    collarRight.position.set(-0.06, 0.05, 0.065);
    j.neck.add(collarRight);

    // --- 5. HEAD & FACIAL FEATURES ---
    // Stylized Low-Poly Head
    const headGeom = new THREE.BoxGeometry(0.18, 0.22, 0.19, 2, 2, 2);
    // Bevel vertices slightly for stylized smooth-faceted low-poly look
    const headMesh = new THREE.Mesh(headGeom, m.skin);
    headMesh.position.y = 0.11;
    headMesh.castShadow = true;
    j.head.add(headMesh);
    this.parts.headMesh = headMesh;

    // Nose (clean low-poly wedge)
    const noseGeom = new THREE.ConeGeometry(0.022, 0.055, 4);
    noseGeom.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeom, m.skin);
    noseMesh.position.set(0, 0.105, 0.11);
    j.head.add(noseMesh);

    // Eyes
    const createEye = (isLeft) => {
      const eyeGroup = new THREE.Group();
      const scleraGeom = new THREE.BoxGeometry(0.038, 0.022, 0.01);
      const sclera = new THREE.Mesh(scleraGeom, m.eyeWhite);
      eyeGroup.add(sclera);

      const pupilGeom = new THREE.BoxGeometry(0.020, 0.022, 0.012);
      const pupil = new THREE.Mesh(pupilGeom, m.eyePupil);
      pupil.position.z = 0.002;
      eyeGroup.add(pupil);

      const x = isLeft ? 0.046 : -0.046;
      eyeGroup.position.set(x, 0.13, 0.098);
      return eyeGroup;
    };
    j.head.add(createEye(true));
    j.head.add(createEye(false));

    // Eyebrows
    const createEyebrow = (isLeft) => {
      const browGeom = new THREE.BoxGeometry(0.048, 0.014, 0.015);
      browGeom.rotateZ(isLeft ? 0.08 : -0.08);
      const brow = new THREE.Mesh(browGeom, m.eyebrow);
      const x = isLeft ? 0.048 : -0.048;
      brow.position.set(x, 0.155, 0.10);
      return brow;
    };
    j.head.add(createEyebrow(true));
    j.head.add(createEyebrow(false));

    // Ears
    const earGeom = new THREE.BoxGeometry(0.018, 0.048, 0.03);
    const leftEar = new THREE.Mesh(earGeom, m.skin);
    leftEar.position.set(0.095, 0.11, -0.01);
    j.head.add(leftEar);
    const rightEar = new THREE.Mesh(earGeom, m.skin);
    rightEar.position.set(-0.095, 0.11, -0.01);
    j.head.add(rightEar);

    // Mouth
    const mouthGeom = new THREE.BoxGeometry(0.042, 0.008, 0.005);
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x6E3E34, roughness: 0.9 });
    const mouth = new THREE.Mesh(mouthGeom, mouthMat);
    mouth.position.set(0, 0.055, 0.098);
    j.head.add(mouth);

    // Hair Group
    this.parts.hairGroup = new THREE.Group();
    j.head.add(this.parts.hairGroup);
    this.rebuildHair();

    // --- 6. WELLES' SIGNATURE RED BANDANA ---
    this.parts.bandana = new THREE.Group();
    this.parts.bandana.name = 'Welles_Red_Bandana';

    // Front triangular cloth covering lower face & hanging over neck
    const bandanaFrontGeom = new THREE.BufferGeometry();
    // 3D vertices forming a snug triangular fold over lower face
    const vertices = new Float32Array([
      // Upper band (nose level)
      -0.095, 0.095, 0.105,
       0.095, 0.095, 0.105,
       0.000, -0.04, 0.125, // Triangle downward tip

      // Left cheek wrap
      -0.095, 0.095, 0.105,
      -0.102, 0.070, -0.04,
       0.000, -0.04, 0.125,

      // Right cheek wrap
       0.095, 0.095, 0.105,
       0.000, -0.04, 0.125,
       0.102, 0.070, -0.04,

      // Neck band wrap around back
      -0.102, 0.070, -0.04,
      -0.075, 0.065, -0.105,
       0.000,  0.03, -0.105,

       0.102, 0.070, -0.04,
       0.000,  0.03, -0.105,
       0.075, 0.065, -0.105,

      // Triangle fill under jaw
      -0.075, 0.065, -0.105,
       0.000, -0.04, 0.125,
       0.000,  0.03, -0.105,

       0.075, 0.065, -0.105,
       0.000,  0.03, -0.105,
       0.000, -0.04, 0.125,
    ]);

    const uvs = new Float32Array([
      0, 1, 1, 1, 0.5, 0,
      0, 1, 0, 0.5, 0.5, 0,
      1, 1, 0.5, 0, 1, 0.5,
      0, 0.5, 0, 0, 0.5, 0,
      1, 0.5, 0.5, 0, 1, 0,
      0, 0, 0.5, 0, 0.5, 0,
      1, 0, 0.5, 0, 0.5, 0,
    ]);

    bandanaFrontGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    bandanaFrontGeom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    bandanaFrontGeom.computeVertexNormals();

    const bandanaMesh = new THREE.Mesh(bandanaFrontGeom, m.bandana);
    bandanaMesh.castShadow = true;
    this.parts.bandana.add(bandanaMesh);

    // Knot at the back of head
    const knotGeom = new THREE.SphereGeometry(0.025, 6, 6);
    const knot = new THREE.Mesh(knotGeom, m.bandana);
    knot.position.set(0, 0.045, -0.11);
    this.parts.bandana.add(knot);

    // Two dangling ribbon/tails of the knot
    const tail1Geom = new THREE.BoxGeometry(0.035, 0.10, 0.008);
    tail1Geom.rotateZ(0.2);
    const tail1 = new THREE.Mesh(tail1Geom, m.bandana);
    tail1.position.set(0.025, -0.015, -0.112);
    this.parts.bandana.add(tail1);

    const tail2Geom = new THREE.BoxGeometry(0.035, 0.08, 0.008);
    tail2Geom.rotateZ(-0.25);
    const tail2 = new THREE.Mesh(tail2Geom, m.bandana);
    tail2.position.set(-0.022, -0.01, -0.112);
    this.parts.bandana.add(tail2);

    j.head.add(this.parts.bandana);

    // --- 7. ARMS & HANDS ---
    const buildArm = (isLeft) => {
      const upperGroup = isLeft ? j.leftUpperArm : j.rightUpperArm;
      const elbowGroup = isLeft ? j.leftElbow : j.rightElbow;
      const wristGroup = isLeft ? j.leftWrist : j.rightWrist;

      // Shoulder cap
      const shoulderGeom = new THREE.SphereGeometry(0.065, 8, 6);
      const shoulderMesh = new THREE.Mesh(shoulderGeom, m.shirt);
      upperGroup.add(shoulderMesh);

      // Upper arm
      const upperArmGeom = new THREE.CylinderGeometry(0.052, 0.045, 0.24, 8);
      const upperArmMesh = new THREE.Mesh(upperArmGeom, m.shirt);
      upperArmMesh.position.y = -0.12;
      upperArmMesh.castShadow = true;
      upperGroup.add(upperArmMesh);

      // Elbow
      const elbowGeom = new THREE.SphereGeometry(0.046, 6, 6);
      const elbowMesh = new THREE.Mesh(elbowGeom, m.shirt);
      elbowGroup.add(elbowMesh);

      // Forearm with cuff
      const forearmGeom = new THREE.CylinderGeometry(0.045, 0.040, 0.21, 8);
      const forearmMesh = new THREE.Mesh(forearmGeom, m.shirt);
      forearmMesh.position.y = -0.105;
      forearmMesh.castShadow = true;
      elbowGroup.add(forearmMesh);

      // Shirt Cuff band
      const cuffGeom = new THREE.CylinderGeometry(0.046, 0.046, 0.035, 8);
      const cuffMesh = new THREE.Mesh(cuffGeom, m.shirt);
      cuffMesh.position.y = -0.21;
      elbowGroup.add(cuffMesh);

      // Hand (stylized low-poly mitten/fingers with separate thumb)
      const palmGeom = new THREE.BoxGeometry(0.075, 0.09, 0.032);
      const palmMesh = new THREE.Mesh(palmGeom, m.skin);
      palmMesh.position.y = -0.05;
      wristGroup.add(palmMesh);

      // Thumb
      const thumbGeom = new THREE.BoxGeometry(0.022, 0.045, 0.022);
      thumbGeom.rotateZ(isLeft ? -0.4 : 0.4);
      const thumbMesh = new THREE.Mesh(thumbGeom, m.skin);
      const tx = isLeft ? -0.038 : 0.038;
      thumbMesh.position.set(tx, -0.04, 0.012);
      wristGroup.add(thumbMesh);
    };

    buildArm(true);
    buildArm(false);

    // --- 8. LEGS & SHOES ---
    const buildLeg = (isLeft) => {
      const hipGroup = isLeft ? j.leftHip : j.rightHip;
      const kneeGroup = isLeft ? j.leftKnee : j.rightKnee;
      const ankleGroup = isLeft ? j.leftAnkle : j.rightAnkle;

      // Thigh
      const thighGeom = new THREE.CylinderGeometry(0.078, 0.062, 0.38, 8);
      const thighMesh = new THREE.Mesh(thighGeom, m.pants);
      thighMesh.position.y = -0.20;
      thighMesh.castShadow = true;
      thighMesh.receiveShadow = true;
      hipGroup.add(thighMesh);

      // Knee joint
      const kneeGeom = new THREE.SphereGeometry(0.063, 6, 6);
      const kneeMesh = new THREE.Mesh(kneeGeom, m.pants);
      kneeGroup.add(kneeMesh);

      // Shin / Calf
      const shinGeom = new THREE.CylinderGeometry(0.062, 0.052, 0.38, 8);
      const shinMesh = new THREE.Mesh(shinGeom, m.pants);
      shinMesh.position.y = -0.20;
      shinMesh.castShadow = true;
      shinMesh.receiveShadow = true;
      kneeGroup.add(shinMesh);

      // Trouser cuff
      const pantCuffGeom = new THREE.CylinderGeometry(0.058, 0.062, 0.05, 8);
      const pantCuffMesh = new THREE.Mesh(pantCuffGeom, m.pants);
      pantCuffMesh.position.y = -0.38;
      kneeGroup.add(pantCuffMesh);

      // Shoe / Foot (stylized classic business oxford shoe)
      const shoeGroup = new THREE.Group();

      // Main shoe body
      const shoeGeom = new THREE.BoxGeometry(0.095, 0.065, 0.22);
      const shoeMesh = new THREE.Mesh(shoeGeom, m.shoes);
      shoeMesh.position.set(0, -0.035, 0.04);
      shoeMesh.castShadow = true;
      shoeGroup.add(shoeMesh);

      // Shoe toe tap
      const toeGeom = new THREE.CylinderGeometry(0.046, 0.048, 0.062, 8);
      toeGeom.scale(1, 0.9, 1.2);
      const toeMesh = new THREE.Mesh(toeGeom, m.shoes);
      toeMesh.position.set(0, -0.038, 0.12);
      shoeGroup.add(toeMesh);

      // Shoe heel / sole
      const heelGeom = new THREE.BoxGeometry(0.098, 0.020, 0.08);
      const soleMat = new THREE.MeshStandardMaterial({ color: 0x0A0A0C, roughness: 0.9 });
      const heelMesh = new THREE.Mesh(heelGeom, soleMat);
      heelMesh.position.set(0, -0.07, -0.04);
      shoeGroup.add(heelMesh);

      ankleGroup.add(shoeGroup);
    };

    buildLeg(true);
    buildLeg(false);
  }

  rebuildHair() {
    const g = this.parts.hairGroup;
    while (g.children.length > 0) {
      g.remove(g.children[0]);
    }

    const style = this.options.hairStyle;
    const m = this.materials;

    if (style === 'welles') {
      // Short modern brown haircut with side part
      // Hair cap
      const capGeom = new THREE.BoxGeometry(0.19, 0.11, 0.21);
      const cap = new THREE.Mesh(capGeom, m.hair);
      cap.position.set(0, 0.19, -0.01);
      g.add(cap);

      // Bangs / Front swept
      const bangsGeom = new THREE.BoxGeometry(0.18, 0.045, 0.04);
      bangsGeom.rotateZ(-0.06);
      const bangs = new THREE.Mesh(bangsGeom, m.hair);
      bangs.position.set(0.01, 0.20, 0.09);
      g.add(bangs);

      // Back taper
      const backGeom = new THREE.BoxGeometry(0.18, 0.09, 0.035);
      const back = new THREE.Mesh(backGeom, m.hair);
      back.position.set(0, 0.13, -0.10);
      g.add(back);
    } else if (style === 'female_long') {
      // Long hair parted in center falling down to shoulders (rescued woman style)
      const topGeom = new THREE.BoxGeometry(0.195, 0.10, 0.21);
      const top = new THREE.Mesh(topGeom, m.hair);
      top.position.set(0, 0.19, -0.01);
      g.add(top);

      // Left curtain hair
      const leftFallGeom = new THREE.BoxGeometry(0.04, 0.26, 0.12);
      const leftFall = new THREE.Mesh(leftFallGeom, m.hair);
      leftFall.position.set(0.09, 0.08, 0.02);
      g.add(leftFall);

      // Right curtain hair
      const rightFallGeom = new THREE.BoxGeometry(0.04, 0.26, 0.12);
      const rightFall = new THREE.Mesh(rightFallGeom, m.hair);
      rightFall.position.set(-0.09, 0.08, 0.02);
      g.add(rightFall);

      // Back flowing hair
      const backLongGeom = new THREE.BoxGeometry(0.18, 0.28, 0.05);
      const backLong = new THREE.Mesh(backLongGeom, m.hair);
      backLong.position.set(0, 0.06, -0.105);
      g.add(backLong);
    } else if (style === 'buzz') {
      // Very close low-poly buzz/bald cap
      const buzzGeom = new THREE.BoxGeometry(0.185, 0.05, 0.195);
      const buzz = new THREE.Mesh(buzzGeom, m.hair);
      buzz.position.set(0, 0.21, -0.005);
      g.add(buzz);

    } else if (style === 'pompadour') {
      // Classic pompadour — high swept-back front volume
      const baseGeom = new THREE.BoxGeometry(0.19, 0.08, 0.20);
      const base = new THREE.Mesh(baseGeom, m.hair);
      base.position.set(0, 0.185, -0.01);
      g.add(base);
      // High front crest
      const crestGeom = new THREE.BoxGeometry(0.17, 0.10, 0.07);
      crestGeom.rotateZ(0.12);
      const crest = new THREE.Mesh(crestGeom, m.hair);
      crest.position.set(-0.01, 0.255, 0.065);
      g.add(crest);
      // Side sweep left
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.19), m.hair);
      sideL.position.set(0.096, 0.17, -0.01);
      g.add(sideL);
      // Side sweep right
      const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.19), m.hair);
      sideR.position.set(-0.096, 0.17, -0.01);
      g.add(sideR);
      // Back taper
      const backGeom = new THREE.BoxGeometry(0.17, 0.08, 0.04);
      const back = new THREE.Mesh(backGeom, m.hair);
      back.position.set(0, 0.14, -0.105);
      g.add(back);

    } else if (style === 'curly') {
      // Low-poly afro / curly — round puffy cap with volume
      const capGeom = new THREE.SphereGeometry(0.125, 7, 5);
      const cap = new THREE.Mesh(capGeom, m.hair);
      cap.scale.set(1.0, 0.85, 1.0);
      cap.position.set(0, 0.235, -0.01);
      g.add(cap);
      // Extra puff sides
      const puffL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), m.hair);
      puffL.position.set(0.1, 0.19, 0.0);
      g.add(puffL);
      const puffR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), m.hair);
      puffR.position.set(-0.1, 0.19, 0.0);
      g.add(puffR);
      // Front fringe puff
      const frontPuff = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), m.hair);
      frontPuff.position.set(0, 0.21, 0.09);
      g.add(frontPuff);

    } else if (style === 'bald') {
      // No hair — just a subtle stubble strip on sides
      const stubbleMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.options.hairColor).multiplyScalar(0.5),
        roughness: 0.95
      });
      const stubbleL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.17), stubbleMat);
      stubbleL.position.set(0.096, 0.145, -0.01);
      g.add(stubbleL);
      const stubbleR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.17), stubbleMat);
      stubbleR.position.set(-0.096, 0.145, -0.01);
      g.add(stubbleR);
    }
  }

  buildCompanion() {
    // The Rescued Survivor Woman in piggyback carry position on Welles' back
    this.companion = new THREE.Group();
    this.companion.name = 'Companion_Rescued_Woman';

    const compHairMat = new THREE.MeshStandardMaterial({ color: 0x4B2E1E, roughness: 0.9 });
    const compTopMat = new THREE.MeshStandardMaterial({ color: 0xC4B79B, roughness: 0.8 }); // beige sweater
    const compPantsMat = new THREE.MeshStandardMaterial({ color: 0x4D535E, roughness: 0.85 }); // grey pants
    const compSkinMat = new THREE.MeshStandardMaterial({ color: 0xE5BE9F, roughness: 0.8 });
    const compShoesMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1D, roughness: 0.7 });

    // Woman Torso resting against Welles' upper back
    const torsoGeom = new THREE.CylinderGeometry(0.12, 0.11, 0.32, 8);
    torsoGeom.scale(1.15, 1, 0.8);
    torsoGeom.rotateX(0.2); // leaning forward against Welles' back
    const torso = new THREE.Mesh(torsoGeom, compTopMat);
    torso.position.set(0, 0.16, -0.22);
    torso.castShadow = true;
    this.companion.add(torso);

    // Woman Head
    const headGeom = new THREE.BoxGeometry(0.15, 0.18, 0.16);
    const head = new THREE.Mesh(headGeom, compSkinMat);
    head.position.set(0.04, 0.38, -0.20); // resting near Welles' right shoulder
    head.rotation.set(0.1, 0.2, 0.1);
    this.companion.add(head);

    // Long hair
    const hairGeom = new THREE.BoxGeometry(0.165, 0.24, 0.17);
    const hair = new THREE.Mesh(hairGeom, compHairMat);
    hair.position.set(0.04, 0.39, -0.21);
    hair.rotation.set(0.1, 0.2, 0.1);
    this.companion.add(hair);

    // Draped arms (around Welles' neck/shoulders)
    const leftArmGeom = new THREE.CylinderGeometry(0.038, 0.032, 0.35, 6);
    leftArmGeom.rotateX(Math.PI / 2);
    leftArmGeom.rotateY(0.4);
    const leftArm = new THREE.Mesh(leftArmGeom, compTopMat);
    leftArm.position.set(0.18, 0.26, -0.06);
    this.companion.add(leftArm);

    const rightArmGeom = new THREE.CylinderGeometry(0.038, 0.032, 0.35, 6);
    rightArmGeom.rotateX(Math.PI / 2);
    rightArmGeom.rotateY(-0.4);
    const rightArm = new THREE.Mesh(rightArmGeom, compTopMat);
    rightArm.position.set(-0.18, 0.26, -0.06);
    this.companion.add(rightArm);

    // Draped legs (wrapped around Welles' hips)
    const leftThighGeom = new THREE.CylinderGeometry(0.055, 0.045, 0.34, 6);
    leftThighGeom.rotateX(Math.PI / 2);
    leftThighGeom.rotateY(-0.4);
    const leftThigh = new THREE.Mesh(leftThighGeom, compPantsMat);
    leftThigh.position.set(0.24, 0.02, -0.08);
    this.companion.add(leftThigh);

    const rightThighGeom = new THREE.CylinderGeometry(0.055, 0.045, 0.34, 6);
    rightThighGeom.rotateX(Math.PI / 2);
    rightThighGeom.rotateY(0.4);
    const rightThigh = new THREE.Mesh(rightThighGeom, compPantsMat);
    rightThigh.position.set(-0.24, 0.02, -0.08);
    this.companion.add(rightThigh);

    // Mounted to chest/back joint
    this.joints.chest.add(this.companion);
    this.companion.visible = this.options.showCompanion;
  }

  updateVisibility() {
    if (this.parts.bandana) {
      this.parts.bandana.visible = !!this.options.hasBandana;
    }
    if (this.parts.tie) {
      this.parts.tie.visible = !!this.options.hasTie;
    }
    if (this.parts.badge) {
      this.parts.badge.visible = !!this.options.hasBadge;
    }
    if (this.companion) {
      this.companion.visible = !!this.options.showCompanion;
    }
  }

  setOption(key, value) {
    this.options[key] = value;
    if (key === 'hasBandana' || key === 'hasTie' || key === 'hasBadge' || key === 'showCompanion') {
      this.updateVisibility();
      return;
    }

    if (key === 'skinColor') {
      this.materials.skin.color.set(value);
    } else if (key === 'hairColor') {
      this.materials.hair.color.set(value);
      this.materials.eyebrow.color.set(value).multiplyScalar(0.7);
    } else if (key === 'hairStyle') {
      this.rebuildHair();
    } else if (key === 'shirtColor') {
      this.materials.shirt.color.set(value);
    } else if (key === 'pantsColor') {
      this.materials.pants.color.set(value);
    } else if (key === 'shoesColor') {
      this.materials.shoes.color.set(value);
    } else if (key === 'bandanaColor') {
      this.bandanaTex = createBandanaTexture(value);
      this.materials.bandana.map = this.bandanaTex;
      this.materials.bandana.color.set(value);
      this.materials.bandana.needsUpdate = true;
    } else if (key === 'wireframe') {
      Object.values(this.materials).forEach(m => {
        if (m) m.wireframe = !!value;
      });
    }
  }

  applyPreset(presetKey) {
    const presets = {
      welles: {
        skinColor: '#E2BE9F',
        hairColor: '#422817',
        hairStyle: 'welles',
        shirtColor: '#F3F4F6',
        pantsColor: '#262A33',
        shoesColor: '#18191B',
        hasBandana: true,
        bandanaColor: '#C9232B',
        hasTie: false,
        hasBadge: false,
        showCompanion: false,
      },
      office_worker: {
        skinColor: '#E0B896',
        hairColor: '#3A271C',
        hairStyle: 'welles',
        shirtColor: '#FFFFFF',
        pantsColor: '#333740',
        shoesColor: '#1A1A1E',
        hasBandana: false,
        hasTie: true,
        tieColor: '#3F4A56',
        hasBadge: false,
        showCompanion: false,
      },
      officer: {
        skinColor: '#C89A79',
        hairColor: '#222226',
        hairStyle: 'buzz',
        shirtColor: '#233247',
        pantsColor: '#1E2633',
        shoesColor: '#111215',
        hasBandana: false,
        hasTie: false,
        hasBadge: true,
        showCompanion: false,
      },
      survivor_woman: {
        skinColor: '#E7C2A6',
        hairColor: '#4B2E1E',
        hairStyle: 'female_long',
        shirtColor: '#C8BAA3',
        pantsColor: '#4C535F',
        shoesColor: '#1E2024',
        hasBandana: false,
        hasTie: false,
        hasBadge: false,
        showCompanion: false,
      },
      running_civilian: {
        skinColor: '#C89A79',
        hairColor: '#4E433D',
        hairStyle: 'buzz',
        shirtColor: '#786F62',
        pantsColor: '#80827F',
        shoesColor: '#262422',
        hasBandana: false,
        hasTie: false,
        hasBadge: false,
        showCompanion: false,
      }
    };

    const p = presets[presetKey];
    if (!p) return;
    Object.entries(p).forEach(([k, v]) => {
      this.setOption(k, v);
    });
  }

  /**
   * Генерирует случайный внешний вид персонажа.
   * Перебирает широкие палитры тона кожи, цвета одежды и стили причёски.
   */
  randomize() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Широкая палитра тонов кожи
    const skinTones = [
      '#FDDBB4', '#F5C9A0', '#E8BA8C', '#E2BE9F', '#D4A574',
      '#C89A6A', '#B07D52', '#8B5E3C', '#6B4226', '#4A2C17',
      '#FAEBD7', '#F0D5B0', '#D8A87C', '#C4845C', '#9E6040',
    ];

    // Палитры волос — реалистичные и стилизованные
    const hairColors = [
      '#1A0A00', '#2C1A0E', '#3B2314', '#422817', '#5C3D1E',
      '#7B4F27', '#9C6B3C', '#B8860B', '#C8A045', '#D4B060',
      '#8B0000', '#6B0F1A', '#4A0E0E',  // рыжие/бордо
      '#808080', '#A0A0A0', '#C8C8C8', '#E8E8E8',  // серые/седые
      '#1C1C1C', '#111111',              // очень тёмные
      '#E8C87A', '#D4A020', '#B8820A',   // блонд
    ];

    const hairStyles = ['welles', 'pompadour', 'female_long', 'buzz', 'curly', 'bald'];

    // Палитры одежды — реалистичные цвета
    const shirtColors = [
      '#FFFFFF', '#F5F5F0', '#F0E8DC', '#E8E0D0',
      '#B8D4E8', '#8BAEC0', '#6B9AB2', '#4A7A96',  // голубые
      '#C8E8C0', '#A0C898', '#6B9E6B',              // зелёные
      '#E8C8B0', '#D4A880', '#B88860',              // бежевые/коричневые
      '#E8D0C0', '#D4A090', '#C87060',              // персиковые
      '#D0C8E8', '#A898CC', '#8878B0',              // фиолетовые
      '#C8D0D8', '#A0A8B0', '#787F88',              // серые
      '#E8E0C0', '#D4C880', '#B8A840',              // жёлтые
      '#E8C0C0', '#D09090', '#B06060',              // красноватые
      '#1A1A2E', '#16213E', '#0F3460',              // тёмно-синие
      '#2D2D2D', '#3D3D3D', '#4A4A4A',              // тёмно-серые
    ];

    const pantsColors = [
      '#1E2128', '#262A33', '#333740', '#3D3D3D',
      '#2A3040', '#1A2535', '#0F1E30',  // тёмно-синие
      '#3A3028', '#4A3E30', '#5A4A38',  // коричневые
      '#5A5A5A', '#6A6A6A', '#7A7A7A',  // серые
      '#2A3A2A', '#1E2E1E', '#3A4E3A',  // оливковые/тёмно-зелёные
      '#4A2A1E', '#6A3A28',              // тёмно-коричневые
      '#1A1A3A', '#252550',              // тёмно-фиолетовые
      '#F5F5F0', '#E8E0D0', '#D0C8B8',  // светлые (кремовые/бежевые брюки)
    ];

    const shoeColors = [
      '#111215', '#1A1A1E', '#282828',
      '#3A2A1E', '#4A3828', '#5A4A38',  // коричневые
      '#8B6940', '#A07840',              // светло-коричневые
      '#FFFFFF', '#F0F0F0',              // белые (кроссовки)
      '#CC3300', '#8B0000',              // красные
      '#1A3A6A', '#0F2A4A',              // тёмно-синие
    ];

    // Случайный цвет банданы (если будет показана)
    const bandanaColors = [
      '#C9232B', '#E63030', '#CC1A1A',  // красный (канонический)
      '#1A3A8A', '#1E4DB0', '#2255CC',  // синий
      '#1A6A1A', '#228B22', '#2E8B57',  // зелёный
      '#8B6914', '#B8860B', '#DAA520',  // золотой
      '#4A1A6A', '#6A2A8A', '#8B2FC9',  // фиолетовый
      '#1A5A5A', '#1E8080', '#20B2AA',  // бирюзовый
      '#3D1A00', '#5A2A00', '#8B4513',  // коричневый
    ];

    const chosenSkin = pick(skinTones);
    const chosenHairColor = pick(hairColors);
    const chosenHairStyle = pick(hairStyles);
    const chosenShirt = pick(shirtColors);
    const chosenPants = pick(pantsColors);
    const chosenShoes = pick(shoeColors);
    const chosenBandana = pick(bandanaColors);
    const hasBandana = Math.random() < 0.25;  // 25% шанс банданы
    const hasTie = !hasBandana && Math.random() < 0.2;
    const hasBadge = Math.random() < 0.15;

    const opts = {
      skinColor: chosenSkin,
      hairColor: chosenHairColor,
      hairStyle: chosenHairStyle,
      shirtColor: chosenShirt,
      pantsColor: chosenPants,
      shoesColor: chosenShoes,
      bandanaColor: chosenBandana,
      hasBandana,
      hasTie,
      hasBadge,
      showCompanion: false,
    };

    Object.entries(opts).forEach(([k, v]) => {
      this.setOption(k, v);
    });

    return opts; // возвращаем чтобы UI мог синхронизироваться
  }
}
