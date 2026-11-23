import * as THREE from "three";
import { WorldNavigation } from "./spark-navigation.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

const viewer = document.getElementById("spark-viewer");

if (viewer) {
  const stage = document.getElementById("spark-viewer-stage");
  const tabs = Array.from(viewer.querySelectorAll(".spark-viewer-tab"));
  const placeholder = document.getElementById("spark-viewer-placeholder");
  const progress = document.getElementById("spark-viewer-progress");
  const progressTrack = progress.querySelector(".spark-viewer-progress-track");
  const progressFill = progress.querySelector(".spark-viewer-progress-fill");
  const progressLabel = progress.querySelector(".spark-viewer-progress-label");
  const status = document.getElementById("spark-viewer-status");
  const resetButton = document.getElementById("spark-viewer-reset");
  const scenes = tabs.map((tab, index) => ({
    id: tab.dataset.sceneId || `scene-${index + 1}`,
    label: tab.dataset.sceneLabel || tab.textContent.trim(),
    url: tab.dataset.sceneUrl,
    size: Number(tab.dataset.sceneSize) || 0,
    tab,
  }));
  const resources = new Map();
  scenes.forEach((scene) => {
    if (!resources.has(scene.url)) resources.set(scene.url, { state: "idle", mesh: null, promise: null });
  });

  let activeSceneId = scenes.length ? scenes[0].id : null;
  let renderer;
  let camera;
  let controls;
  let navigation;
  let clock;
  let threeScene;
  let initialized = false;
  let userMovedCamera = false;
  const pressedKeys = new Set();

  function activeScene() { return scenes.find((scene) => scene.id === activeSceneId); }
  function resourceFor(scene) { return resources.get(scene.url); }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
  }
  function updateTabs() {
    scenes.forEach((scene) => {
      const resource = resourceFor(scene);
      scene.tab.classList.toggle("is-loading", resource.state === "loading");
      scene.tab.classList.toggle("is-loaded", resource.state === "loaded");
      scene.tab.classList.toggle("is-error", resource.state === "error");
      scene.tab.setAttribute("aria-selected", String(scene.id === activeSceneId));
      scene.tab.tabIndex = scene.id === activeSceneId ? 0 : -1;
    });
  }

  function resetView() {
    if (!camera || !controls) return;
    pressedKeys.clear();
    navigation.reset();
  }

  function initializeViewer() {
    if (initialized) return;
    initialized = true;
    placeholder.hidden = true;
    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x111111);
    camera = new THREE.PerspectiveCamera(55, stage.clientWidth / stage.clientHeight, .01, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "3D scene canvas: drag to rotate");
    stage.prepend(renderer.domElement);
    navigation = new WorldNavigation(camera, renderer.domElement);
    controls = navigation.controls;
    controls.addEventListener("start", () => { userMovedCamera = true; });
    renderer.domElement.addEventListener("pointerdown", () => renderer.domElement.focus({ preventScroll: true }));
    resetView();
    threeScene.add(new SparkRenderer({ renderer }));
    clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      navigation.update(clock.getDelta(), pressedKeys);
      renderer.render(threeScene, camera);
    });
  }

  function showProgress(scene, event) {
    if (scene.id !== activeSceneId) return;
    progress.hidden = false;
    const total = event.total || scene.size || 0;
    if (total) {
      const percent = Math.min(100, event.loaded / total * 100);
      progressTrack.classList.remove("is-indeterminate");
      progressFill.style.width = `${percent}%`;
      progressTrack.setAttribute("aria-valuenow", String(Math.round(percent)));
      progressLabel.textContent = `${scene.label}  ${Math.round(percent)}%  (${formatBytes(event.loaded)} / ${formatBytes(total)})`;
    } else {
      progressTrack.classList.add("is-indeterminate");
      progressLabel.textContent = `${scene.label}  ${formatBytes(event.loaded)} downloaded`;
    }
  }

  function loadScene(scene) {
    const resource = resourceFor(scene);
    if (resource.state === "loaded") return Promise.resolve(resource.mesh);
    if (resource.promise) return resource.promise;
    resource.state = "loading";
    updateTabs();
    progress.hidden = false;
    progressTrack.classList.add("is-indeterminate");
    progressLabel.textContent = `Preparing ${scene.label}...`;
    status.textContent = "Large scenes may take a moment to decode after downloading.";
    resource.promise = new Promise((resolve, reject) => {
      try {
        const mesh = new SplatMesh({ url: scene.url, onProgress: (event) => showProgress(scene, event), onLoad: () => resolve(mesh) });
        resource.mesh = mesh;
        mesh.visible = scene.url === activeScene().url;
        threeScene.add(mesh);
        if (mesh.initialized) mesh.initialized.catch(reject);
      } catch (error) { reject(error); }
    }).then((mesh) => {
      resource.bounds = mesh.getBoundingBox();
      resource.state = "loaded";
      resource.promise = null;
      updateTabs();
      if (scene.url === activeScene().url) {
        mesh.visible = true;
        progress.hidden = true;
        status.textContent = `${activeScene().label} loaded${scene.size ? ` (${formatBytes(scene.size)})` : ""}.`;
        navigation.setBounds(resource.bounds);
        if (!userMovedCamera) resetView();
      }
      return mesh;
    }).catch((error) => {
      console.error(`Failed to load ${scene.url}`, error);
      if (resource.mesh) { threeScene.remove(resource.mesh); if (resource.mesh.dispose) resource.mesh.dispose(); }
      resource.mesh = null;
      resource.promise = null;
      resource.state = "error";
      updateTabs();
      if (scene.id === activeSceneId) { progress.hidden = true; status.textContent = `Could not load ${scene.label}. Click its tab to retry.`; }
      throw error;
    });
    return resource.promise;
  }

  function selectScene(id) {
    activeSceneId = id;
    pressedKeys.clear();
    userMovedCamera = false;
    initializeViewer();
    const scene = activeScene();
    resources.forEach((resource, url) => { if (resource.mesh) resource.mesh.visible = url === scene.url; });
    updateTabs();
    const resource = resourceFor(scene);
    if (resource.state === "loaded") {
      progress.hidden = true;
      status.textContent = `${scene.label} restored from memory.`;
      userMovedCamera = false;
      navigation.setBounds(resource.bounds);
      resetView();
    } else loadScene(scene).catch(() => {});
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => selectScene(tab.dataset.sceneId)));
  viewer.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "r") { pressedKeys.clear(); userMovedCamera = false; resetView(); event.preventDefault(); return; }
    if (!["w", "a", "s", "d", "q", "e", "i", "j", "k", "l", "shift", "alt"].includes(key)) return;
    pressedKeys.add(key); userMovedCamera = true; event.preventDefault();
  });
  viewer.addEventListener("keyup", (event) => pressedKeys.delete(event.key.toLowerCase()));
  viewer.addEventListener("focusout", () => pressedKeys.clear());
  window.addEventListener("blur", () => pressedKeys.clear());
  document.addEventListener("visibilitychange", () => { if (document.hidden) pressedKeys.clear(); });
  resetButton.addEventListener("click", () => {
    userMovedCamera = false;
    resetView();
    if (renderer) renderer.domElement.focus({ preventScroll: true });
  });
  new ResizeObserver(() => {
    if (!renderer || !camera || !stage.clientWidth || !stage.clientHeight) return;
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  }).observe(stage);
  const visibilityObserver = new IntersectionObserver((entries, observer) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    selectScene(scenes[0].id);
  }, { threshold: .05 });
  visibilityObserver.observe(viewer);
  updateTabs();
}
