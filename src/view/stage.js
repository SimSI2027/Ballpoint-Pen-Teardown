// Studio: renderer, lights, floor shadow, camera. Throws if WebGL is unavailable.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { cameraFromView } from './views.js';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e7e2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // procedural, no assets
  scene.environmentIntensity = 0.55;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-70, 130, 90);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 400;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 5;
  scene.add(key);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 600),
    new THREE.ShadowMaterial({ opacity: 0.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -24;
  floor.receiveShadow = true;
  scene.add(floor);

  const camera = new THREE.PerspectiveCamera(28, 1, 5, 2000);
  let width = 1, height = 1;

  return {
    scene, camera, renderer,
    resize(w, h) {
      width = Math.max(1, Math.floor(w)); height = Math.max(1, Math.floor(h));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    get aspect() { return width / height; },
    render(view) {
      const c = cameraFromView(view, width / height);
      camera.position.set(...c.position);
      camera.lookAt(...c.target);
      camera.updateMatrixWorld(true);
      renderer.render(scene, camera);
    },
    /** Project a world point to stage pixels. */
    project(v) {
      const p = v.clone().project(camera);
      return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, visible: p.z < 1 };
    },
  };
}
