import * as THREE from "three";

export const loadingManager = new THREE.LoadingManager();

loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
  const pct = Math.round((itemsLoaded / itemsTotal) * 100);
  window.dispatchEvent(new CustomEvent("loadingProgress", { detail: pct }));
};

loadingManager.onLoad = function () {
  window.dispatchEvent(new CustomEvent("loadingComplete"));
};
