import * as THREE from 'three';

/**
 * Procedural Kinematics Animator for Nixly Characters.
 * Runs at 60 FPS and updates joint rotations & positions smoothly.
 */
export class CharacterAnimator {
  constructor(character) {
    this.char = character;
    this.currentClip = 'idle'; // 'idle' | 'run' | 'stairwell_walk' | 'carry_piggyback' | 'directing' | 'shock_look_up'
    this.speed = 1.0;
    this.time = 0;
    this.isPlaying = true;

    // Default rest transforms
    this.rest = {
      hipsY: 0.96,
      rootY: 0,
    };
  }

  setClip(clipName) {
    this.currentClip = clipName;
    this.time = 0;
    // Auto toggle companion for piggyback pose if not overridden
    if (clipName === 'carry_piggyback') {
      this.char.setOption('showCompanion', true);
    }
  }

  setSpeed(val) {
    this.speed = Math.max(0.1, Math.min(3.0, val));
  }

  resetJoints() {
    const j = this.char.joints;
    Object.values(j).forEach(joint => {
      joint.rotation.set(0, 0, 0);
    });
    j.hips.position.set(0, this.rest.hipsY, 0);
    j.root.position.set(0, this.rest.rootY, 0);
  }

  update(delta) {
    if (!this.isPlaying) return;
    this.time += delta * this.speed;
    const t = this.time;
    const j = this.char.joints;

    switch (this.currentClip) {
      case 'idle':
        this.animateIdle(t, j);
        break;
      case 'run':
        this.animateRun(t, j);
        break;
      case 'stairwell_walk':
        this.animateStairsWalk(t, j);
        break;
      case 'carry_piggyback':
        this.animateCarryPiggyback(t, j);
        break;
      case 'directing':
        this.animateDirecting(t, j);
        break;
      case 'shock_look_up':
        this.animateShockLookUp(t, j);
        break;
      default:
        this.animateIdle(t, j);
    }
  }

  animateIdle(t, j) {
    const breath = Math.sin(t * 2.2);
    const sway = Math.sin(t * 1.1);

    // Subtle hips bounce & weight shift
    j.hips.position.y = this.rest.hipsY + breath * 0.008;
    j.hips.rotation.z = sway * 0.015;
    j.hips.rotation.y = sway * 0.03;

    // Spine & chest breathing
    j.spine.rotation.x = breath * 0.02;
    j.chest.rotation.x = breath * 0.03;

    // Head subtle glance
    j.head.rotation.y = Math.sin(t * 0.8) * 0.12;
    j.head.rotation.x = breath * 0.015;

    // Relaxed arms hanging with slight natural swing
    j.leftUpperArm.rotation.x = Math.sin(t * 1.5) * 0.04;
    j.leftUpperArm.rotation.z = 0.12 + breath * 0.01;
    j.leftElbow.rotation.x = -0.18 + breath * 0.02;

    j.rightUpperArm.rotation.x = -Math.sin(t * 1.5) * 0.04;
    j.rightUpperArm.rotation.z = -0.12 - breath * 0.01;
    j.rightElbow.rotation.x = -0.18 + breath * 0.02;

    // Legs straight / relaxed
    j.leftThigh.rotation.set(0, 0, 0.04);
    j.leftKnee.rotation.set(0, 0, 0);
    j.rightThigh.rotation.set(0, 0, -0.04);
    j.rightKnee.rotation.set(0, 0, 0);
  }

  animateRun(t, j) {
    const freq = 10.0;
    const phase = t * freq;
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);

    // Forward lean of athletic sprint
    j.hips.position.y = this.rest.hipsY + Math.abs(sinP) * 0.06 - 0.03;
    j.hips.rotation.y = sinP * 0.15;
    j.hips.rotation.z = -cosP * 0.05;

    j.spine.rotation.x = 0.28; // 16 degrees forward lean
    j.chest.rotation.x = 0.08;
    j.chest.rotation.y = -sinP * 0.22; // Counter-rotation of shoulders

    j.head.rotation.x = -0.22; // Head stays level looking ahead
    j.head.rotation.y = sinP * 0.05;

    // Vigorous arm pumping
    const armSwing = 0.95;
    j.leftUpperArm.rotation.x = sinP * armSwing;
    j.leftUpperArm.rotation.z = 0.18;
    j.leftElbow.rotation.x = -0.85 + Math.max(0, -sinP) * 0.45;

    j.rightUpperArm.rotation.x = -sinP * armSwing;
    j.rightUpperArm.rotation.z = -0.18;
    j.rightElbow.rotation.x = -0.85 + Math.max(0, sinP) * 0.45;

    // High leg drive & knee lift
    const legSwing = 1.05;
    // Left leg
    j.leftThigh.rotation.x = -sinP * legSwing;
    if (sinP < 0) {
      // Forward drive: knee flexed
      j.leftKnee.rotation.x = Math.max(0, -sinP * 1.5);
    } else {
      // Back extension: straight leg push-off
      j.leftKnee.rotation.x = 0.15;
    }
    j.leftAnkle.rotation.x = -sinP * 0.25;

    // Right leg (opposite phase)
    j.rightThigh.rotation.x = sinP * legSwing;
    if (sinP > 0) {
      j.rightKnee.rotation.x = Math.max(0, sinP * 1.5);
    } else {
      j.rightKnee.rotation.x = 0.15;
    }
    j.rightAnkle.rotation.x = sinP * 0.25;
  }

  animateStairsWalk(t, j) {
    const freq = 4.5;
    const phase = t * freq;
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);

    // Careful downward stepping cadence
    j.hips.position.y = this.rest.hipsY + Math.sin(phase * 2) * 0.035;
    j.hips.rotation.y = sinP * 0.08;

    j.spine.rotation.x = 0.14; // slight forward gaze at steps
    j.head.rotation.x = 0.18; // looking down at staircase steps

    // Arms balanced at sides
    j.leftUpperArm.rotation.x = sinP * 0.35;
    j.leftUpperArm.rotation.z = 0.15;
    j.leftElbow.rotation.x = -0.35;

    j.rightUpperArm.rotation.x = -sinP * 0.35;
    j.rightUpperArm.rotation.z = -0.15;
    j.rightElbow.rotation.x = -0.35;

    // Step descent motion
    j.leftThigh.rotation.x = -sinP * 0.55;
    j.leftKnee.rotation.x = Math.max(0, -sinP * 0.85);

    j.rightThigh.rotation.x = sinP * 0.55;
    j.rightKnee.rotation.x = Math.max(0, sinP * 0.85);
  }

  animateCarryPiggyback(t, j) {
    const freq = 3.8;
    const phase = t * freq;
    const sinP = Math.sin(phase);

    // Welles carrying Ling Young down Stairwell A:
    // Heavy forward tilt (22 degrees) to support weight
    j.hips.position.y = this.rest.hipsY - 0.05 + Math.sin(phase * 2) * 0.025;
    j.hips.rotation.y = sinP * 0.06;

    j.spine.rotation.x = 0.38; // 22 deg lean forward
    j.chest.rotation.x = 0.10;
    j.head.rotation.x = -0.15; // head looking forward down stairwell

    // Both arms hooked backward, holding the survivor's thighs
    j.leftUpperArm.rotation.x = -0.45;
    j.leftUpperArm.rotation.z = 0.25;
    j.leftUpperArm.rotation.y = -0.10;
    j.leftElbow.rotation.x = -1.25; // hooked around legs

    j.rightUpperArm.rotation.x = -0.45;
    j.rightUpperArm.rotation.z = -0.25;
    j.rightUpperArm.rotation.y = 0.10;
    j.rightElbow.rotation.x = -1.25;

    // Sturdy, heavy steps
    j.leftThigh.rotation.x = -sinP * 0.45 + 0.12;
    j.leftKnee.rotation.x = Math.max(0.1, -sinP * 0.7);

    j.rightThigh.rotation.x = sinP * 0.45 + 0.12;
    j.rightKnee.rotation.x = Math.max(0.1, sinP * 0.7);
  }

  animateDirecting(t, j) {
    // Welles or Concourse Officer directing evacuees: "This way! Follow me! Go!"
    const pulse = Math.sin(t * 3.5);

    j.hips.position.y = this.rest.hipsY;
    j.hips.rotation.y = 0.25; // turned 3/4 to audience
    j.spine.rotation.x = 0.05;

    // Head turning back and forth between exit and crowd
    j.head.rotation.y = -0.35 + Math.sin(t * 1.5) * 0.35;
    j.head.rotation.x = -0.05;

    // Right arm firmly extended pointing towards the exit
    j.rightUpperArm.rotation.set(-1.35, -0.25, 0.2); // raised arm pointing
    j.rightElbow.rotation.set(-0.25, 0, 0); // straight point
    j.rightWrist.rotation.set(pulse * 0.08, 0, 0); // pulsing gesture

    // Left arm beckoning / waving people forward
    j.leftUpperArm.rotation.set(-0.75 + pulse * 0.2, 0.4, 0.3);
    j.leftElbow.rotation.set(-0.95 + pulse * 0.25, 0, 0);

    // Sturdy wide stance
    j.leftThigh.rotation.set(0.1, 0, 0.15);
    j.leftKnee.rotation.set(0.15, 0, 0);
    j.rightThigh.rotation.set(-0.15, 0, -0.15);
    j.rightKnee.rotation.set(0.2, 0, 0);
  }

  animateShockLookUp(t, j) {
    // Shocked look upward at the towers / impact smoke
    const tremble = Math.sin(t * 12.0) * 0.008;

    j.hips.position.y = this.rest.hipsY - 0.02;
    j.spine.rotation.x = -0.22; // leaning back
    j.chest.rotation.x = -0.18;

    // Head tilted straight up in awe
    j.head.rotation.x = -0.75 + tremble; // ~45-50 degrees straight up
    j.head.rotation.y = Math.sin(t * 0.8) * 0.08;

    // Arms hanging slightly open in shock/disbelief
    j.leftUpperArm.rotation.set(-0.15, 0, 0.35 + tremble);
    j.leftElbow.rotation.set(-0.45, 0, 0);

    j.rightUpperArm.rotation.set(-0.15, 0, -0.35 - tremble);
    j.rightElbow.rotation.set(-0.45, 0, 0);

    // Feet planted
    j.leftThigh.rotation.set(0.08, 0, 0.08);
    j.leftKnee.rotation.set(0.08, 0, 0);
    j.rightThigh.rotation.set(-0.05, 0, -0.08);
    j.rightKnee.rotation.set(0.10, 0, 0);
  }
}
