import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// These worlds use Z as the vertical axis. OrbitControls caches this basis at
// construction, so camera.up must be set before creating the controls.
export class WorldNavigation {
  constructor(camera, element) {
    this.camera = camera;
    camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(camera, element);
    const controls = this.controls;
    controls.enableDamping = true;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = .05;
    controls.maxPolarAngle = Math.PI - .05;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.center = new THREE.Vector3(0, 0, -.2);
    this.radius = .6;
    this.setBounds(new THREE.Box3(new THREE.Vector3(-.5, -.5, -.3), new THREE.Vector3(.5, .5, 0)));
    this.reset();
  }

  setBounds(bounds) {
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    if (![...bounds.min, ...bounds.max].every(Number.isFinite)) return;
    bounds.getCenter(this.center);
    this.radius = Math.max(size.length() / 2, .001);
    this.moveSpeed = this.radius * .5;
    this.controls.minDistance = this.radius * .02;
    this.controls.maxDistance = this.radius * 20;
    this.camera.near = this.radius * .001;
    this.camera.far = this.radius * 100;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    const camera = this.camera;
    this.controls.enableDamping = false;
    this.controls.update();
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
    const distance = Math.min(this.controls.maxDistance, this.radius / Math.sin(limitingFov) * 1.08);
    const direction = new THREE.Vector3(-Math.sqrt(3 / 8), Math.sqrt(3 / 8), .5);
    this.controls.target.copy(this.center);
    camera.position.copy(this.center).addScaledVector(direction, distance);
    camera.up.set(0, 0, 1);
    camera.lookAt(this.center);
    // Flush pending mouse momentum so reset stays at the requested view.
    this.controls.update();
    this.controls.enableDamping = true;
  }

  update(delta, keys) {
    const camera = this.camera, controls = this.controls;
    delta = Math.min(Math.max(delta, 0), .05);
    if (keys.size) {
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const flat = new THREE.Vector3(forward.x, forward.y, 0);
      if (flat.lengthSq() < 1e-8) flat.set(0, 1, 0);
      flat.normalize();
      const right = new THREE.Vector3().crossVectors(flat, camera.up).normalize();
      const move = new THREE.Vector3();
      if (keys.has("w")) move.add(flat);
      if (keys.has("s")) move.sub(flat);
      if (keys.has("d")) move.add(right);
      if (keys.has("a")) move.sub(right);
      if (keys.has("e")) move.z += 1;
      if (keys.has("q")) move.z -= 1;
      // Speed follows scene scale and becomes gentler while zoomed in.
      let speed = Math.min(this.moveSpeed, camera.position.distanceTo(controls.target) * .7);
      if (keys.has("shift")) speed *= 3;
      if (keys.has("alt")) speed *= .35;
      if (move.lengthSq()) {
        move.normalize().multiplyScalar(speed * delta);
        camera.position.add(move);
        controls.target.add(move);
      }
      const yaw = Number(keys.has("j")) - Number(keys.has("l"));
      const pitch = Number(keys.has("i")) - Number(keys.has("k"));
      if (yaw || pitch) {
        const distance = Math.max(camera.position.distanceTo(controls.target), controls.minDistance);
        const azimuth = Math.atan2(forward.y, forward.x) + yaw * 1.2 * delta;
        const elevation = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(forward.z, -1, 1)) + pitch * 1.2 * delta, -Math.PI / 2 + .06, Math.PI / 2 - .06);
        controls.target.copy(camera.position).add(new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation)).multiplyScalar(distance));
      }
    }
    controls.update();
  }
}
