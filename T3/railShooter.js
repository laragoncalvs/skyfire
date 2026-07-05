// Shader implementado com auxílio do Claude.ai

import * as THREE from "three";
import {
  initRenderer,
  initCamera,
  onWindowResize,
  SecondaryBox,
} from "../libs/util/util.js";
import GUI from "../libs/util/dat.gui.module.js";
import Stats from "../build/jsm/libs/stats.module.js";
import { GLTFLoader } from "../build/jsm/loaders/GLTFLoader.js";
import { movimentacaoAviao, rotacaoAviao } from "./aviao.js";
import { updateChunks } from "./terrain.js";
import { createWater, updateWater } from "./terrain.js";
import {
  animarHealthpack,
  atractHealthpackToAviao,
  initHealthpack,
  spawnHealthpack,
} from "./healthPacks.js";
import { loadingManager } from "./loadingManager.js";
import {
  spawnProximoFighter,
  moverFighter,
  tiroInimigoAnimacao,
  podeInimigoAtirar,
  cloneTiroInimigo,
} from "./enemys.js";

//-----------------------------------------------------------------------------------------------
//Inicialização da cena, camera, renderizador
//-----------------------------------------------------------------------------------------------
let jogoIniciado = false;

// Detecção de mobile. Usada apenas para ligar/desligar comportamentos extras;
// nenhum bloco de código do desktop foi removido ou alterado por causa disso.
const isMobile =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

let scene, renderer, camera;
scene = new THREE.Scene();
renderer = initRenderer();

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  260,
);

camera.position.set(0, 22, 38);
camera.lookAt(0, 15, -45);
scene.add(camera);

window.addEventListener(
  "resize",
  function () {
    onWindowResize(camera, renderer);
    calcularLimitesTelaMobile();
  },
  false,
);
const container = document.getElementById("container");
const stats = new Stats();
container.appendChild(stats.dom);

function createSkyBackground() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;

  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(1, "#a5eafd");
  gradient.addColorStop(0.3, "#1cbbf9");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
}

scene.background = createSkyBackground();

// no escopo do módulo, como antes
let spawnInterval = null;
let intervaloTiroFighter = null;
let intervaloTiroFighter2 = null;
//-----------------------------------------------------------------------------------------------
// Loading manager
//-----------------------------------------------------------------------------------------------

const loader = new GLTFLoader(loadingManager);

//-----------------------------------------------------------------------------------------------
//Constantes e modos de velocidade
//-----------------------------------------------------------------------------------------------

let VELOCIDADE = 0.3;
let VELOCIDADE_INIMIGO = 0.003;
let CADENCIA_TIRO = 1000;
let VELOCIDADE_ROTACAO = 0.2;
let VELOCIDADE_ROTACAO_X = 0.1;
let VELOCIDADE_AVIAO = 0.03;
let INTERVALO_FIGHTERS = 10000;

window.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "1":
      VELOCIDADE = 0.2;
      VELOCIDADE_INIMIGO = 0.001;
      CADENCIA_TIRO = 1200;
      VELOCIDADE_ROTACAO = 0.1;
      VELOCIDADE_ROTACAO_X = 0.05;
      VELOCIDADE_AVIAO = 0.015;
      INTERVALO_FIGHTERS = 10000;
      reiniciarIntervalos();
      break;
    case "2":
      VELOCIDADE = 0.3;
      VELOCIDADE_INIMIGO = 0.003;
      CADENCIA_TIRO = 1000;
      VELOCIDADE_ROTACAO = 0.15;
      VELOCIDADE_ROTACAO_X = 0.08;
      VELOCIDADE_AVIAO = 0.02;
      INTERVALO_FIGHTERS = 8000;
      reiniciarIntervalos();
      break;
    case "3":
      VELOCIDADE = 0.5;
      VELOCIDADE_INIMIGO = 0.005;
      CADENCIA_TIRO = 500;
      VELOCIDADE_ROTACAO = 0.2;
      VELOCIDADE_ROTACAO_X = 0.1;
      VELOCIDADE_AVIAO = 0.035;
      INTERVALO_FIGHTERS = 6000;
      reiniciarIntervalos();
      break;
  }
});

//-----------------------------------------------------------------------------------------------
// Fog e slider, infobox
//-----------------------------------------------------------------------------------------------

scene.fog = new THREE.Fog("#8fe7ff", 20, 100);
function buildInterface() {
  var gui = new GUI();

  gui
    .add(scene.fog, "far", 60, 190)
    .name("Fog Far")
    .onChange(() => updateShadowVolume());
}
function buildInterfaceMobile() {
  var gui = new GUI({ width: 200 });

  const ctrl = gui
    .add(scene.fog, "far", 60, 190)
    .name("Fog Far")
    .onChange(() => updateShadowVolume());

  gui.domElement.style.position = "absolute";
  gui.domElement.style.top = "50px"; // ajuste conforme a altura do seu FPS box
  gui.domElement.style.left = "0px"; // alinhado à esquerda, embaixo do FPS
  gui.domElement.style.right = "auto";
}

//-----------------------------------------------------------------------------------------------
// Adicionar avião com bounding box e função de colisão
//-----------------------------------------------------------------------------------------------

let aviao = null;
loader.load("./assets/aviao.glb", function (gltf) {
  aviao = gltf.scene;
  aviao.position.set(0, 20, 0);
  aviao.scale.set(1.5, 1.5, 1.5);
  aviao.rotation.y = Math.PI / 1.0;
  scene.add(aviao);
  // Agora que o avião foi adicionado, inicialize as BBs e healthpacks
  inicializarBBsAviao();
  initHealthpack(scene, aviao);
  calcularLimitesTelaMobile();
});

let aviaoAsset = {
  bb: new THREE.Box3(),
  bbHelper: null,
  bbs: [],
};

function inicializarBBsAviao() {
  if (!aviao) return;
  aviao.updateMatrixWorld(true);
  aviaoAsset.bb.setFromObject(aviao);

  aviao.traverse((child) => {
    if (child.isMesh) {
      child.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(child);

      aviaoAsset.bbs.push({ bb, mesh: child });
    }
  });
}

function atualizarBBsAviao() {
  aviaoAsset.bb.setFromObject(aviao);
  for (const item of aviaoAsset.bbs) {
    item.bb.setFromObject(item.mesh);
  }
}

function tiroAcertouAviao(bbTiro) {
  if (!bbTiro.intersectsBox(aviaoAsset.bb)) return false;

  for (const item of aviaoAsset.bbs) {
    if (bbTiro.intersectsBox(item.bb)) return true;
  }
  return false;
}

// aviao será adicionado no callback de carregamento; não adicionar nulo aqui

//-----------------------------------------------------------------------------------------------
//Iluminação e sombra direcional
//-----------------------------------------------------------------------------------------------

let dirLight = new THREE.DirectionalLight("rgb(255,255,255)", 5);

function setDirectionalLighting() {
  dirLight.castShadow = true;

  dirLight.target.position.set(0, 0, 0);
  scene.add(dirLight);
  scene.add(dirLight.target);
}

function updateShadowVolume() {
  const halfSize = scene.fog.far * 0.8;

  dirLight.shadow.camera.left = -halfSize;
  dirLight.shadow.camera.right = halfSize;
  dirLight.shadow.camera.top = halfSize;
  dirLight.shadow.camera.bottom = -halfSize;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = scene.fog.far + 100;

  const res = scene.fog.far > 150 ? 2048 : 1024;
  dirLight.shadow.mapSize.width = res;
  dirLight.shadow.mapSize.height = res;

  dirLight.shadow.bias = -0.003;
  dirLight.shadow.normalBias = 0.15;

  dirLight.shadow.camera.updateProjectionMatrix();
}
setDirectionalLighting();
updateShadowVolume();

//-----------------------------------------------------------------------------------------------
// Efeitos de som
//-----------------------------------------------------------------------------------------------
export function playSound(url) {
  const audio = new Audio(url);

  audio.volume = 0.8;
  audio.currentTime = 0;

  audio.play().catch(console.error);
}

// Áudio de fundo em escopo de módulo, para que possa ser controlado tanto pela
// tecla "S" quanto pelo botão de música da interface (mobile/desktop).
let backgroundAudio = null;
let musicaPausada = false;

function playBackgroundMusic() {
  backgroundAudio = new Audio("./assets/audio/background-music.mp3");
  backgroundAudio.loop = true;
  backgroundAudio.volume = 0.3;

  backgroundAudio.play().catch(console.error);
}

function alternarMusicaFundo() {
  if (!backgroundAudio) return;

  if (musicaPausada) {
    backgroundAudio.play().catch(console.error);
  } else {
    backgroundAudio.pause();
  }

  musicaPausada = !musicaPausada;
}

window.addEventListener("keydown", function (e) {
  if (e.key.toLowerCase() === "s") {
    alternarMusicaFundo();
  }
});

// Disparado pelo botão de música da interface (funciona em desktop e mobile)
window.addEventListener("toggleMusic", alternarMusicaFundo);

//-----------------------------------------------------------------------------------------------
// Implementação do raycaster para movimentação do avião em X e Y e da câmera em X
//-----------------------------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const targetPoint = new THREE.Vector3();
const planoMouse = new THREE.Plane();
const targetCameraX = { value: 0 };
let mouseMovendo = false;
let mouseTimer = null;

const cursorGeo = new THREE.PlaneGeometry(3, 3);
const cursorMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  wireframe: true,
});
const planeNormal = new THREE.Vector3(0, 0, 1);
const planePoint = new THREE.Vector3(0, 0, 0);

const cursor3D = new THREE.Mesh(cursorGeo, cursorMat);
scene.add(cursor3D);

// No mobile o cursor não deve aparecer: toda mira é feita apenas pelo joystick,
// sem nenhum indicador visual de mouse/toque na tela.
if (isMobile) {
  cursor3D.visible = false;
}

const LIMITE_Y_MIN = 15;
const LIMITE_Y_MAX = 100;
const LIMITE_X_MIN = -70;
const LIMITE_X_MAX = 70;

// Limites equivalentes, calculados dinamicamente para caber na tela do celular
// (aspect ratio diferente do desktop). Em desktop esses valores nunca são usados.
let LIMITE_X_MIN_MOBILE = LIMITE_X_MIN;
let LIMITE_X_MAX_MOBILE = LIMITE_X_MAX;
let LIMITE_Y_MIN_MOBILE = LIMITE_Y_MIN;
let LIMITE_Y_MAX_MOBILE = LIMITE_Y_MAX;

function calcularLimitesTelaMobile() {
  if (!isMobile) return; // não afeta o desktop

  const distanciaZ = 45; // distância aproximada entre câmera e avião no eixo Z
  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const alturaVisivel = 2 * Math.tan(vFOV / 2) * distanciaZ;
  const larguraVisivel = alturaVisivel * camera.aspect;

  const margem = 0.75; // deixa uma margem de segurança para o avião não sair da tela
  LIMITE_X_MIN_MOBILE = -(larguraVisivel / 2) * margem;
  LIMITE_X_MAX_MOBILE = (larguraVisivel / 2) * margem;

  const centroY = 17;
  LIMITE_Y_MIN_MOBILE = Math.max(5, centroY - (alturaVisivel / 2) * margem);
  LIMITE_Y_MAX_MOBILE = Math.min(30, centroY + (alturaVisivel / 2) * margem);
}
calcularLimitesTelaMobile();

window.addEventListener("mousemove", function (e) {
  if (isMobile) return; // mobile usa apenas o joystick, nunca toque/mouse
  if (!aviao) return; // aguarda avião carregar
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  targetCameraX.value = aviao.position.x * 0.3;

  raycaster.setFromCamera(mouse, camera);

  planePoint.z = aviao.position.z;
  planoMouse.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

  if (raycaster.ray.intersectPlane(planoMouse, targetPoint)) {
    targetPoint.y = THREE.MathUtils.clamp(
      targetPoint.y,
      LIMITE_Y_MIN,
      LIMITE_Y_MAX,
    );
    targetPoint.x = THREE.MathUtils.clamp(
      targetPoint.x,
      LIMITE_X_MIN,
      LIMITE_X_MAX,
    );

    cursor3D.position.copy(targetPoint);
  }

  mouseMovendo = true;
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => {
    mouseMovendo = false;
  }, 100);
});

//-----------------------------------------------------------------------------------------------
// Joystick virtual (mobile) - controla a mira do avião, assim como o mouse
//-----------------------------------------------------------------------------------------------
// O HTML dispara os eventos "joystickMove" ({detail:{x,y}}, com x e y normalizados
// entre -1 e 1) e "joystickEnd" quando o usuário solta o joystick.
// A mira (cursor3D / targetPoint) é deslocada de forma incremental, e o avião
// dispara automaticamente enquanto a mira estiver sendo modificada.

const JOYSTICK_VELOCIDADE = 1.0; // velocidade de deslocamento da mira por frame
let joystickAtivo = false;
let joystickVetor = { x: 0, y: 0 };

window.addEventListener("joystickMove", (e) => {
  if (!aviao) return;

  joystickVetor.x = e.detail.x;
  joystickVetor.y = e.detail.y;

  if (!joystickAtivo) {
    joystickAtivo = true;

    // Dispara automaticamente assim que a mira é movida, sem precisar de botão de tiro
    if (jogoIniciado && !intervaloDisparo) {
      atirar();
      intervaloDisparo = setInterval(atirar, 900);
    }
  }

  mouseMovendo = true;
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => {
    mouseMovendo = false;
  }, 100);
});

window.addEventListener("joystickEnd", () => {
  joystickAtivo = false;
  joystickVetor.x = 0;
  joystickVetor.y = 0;

  clearInterval(intervaloDisparo);
  intervaloDisparo = null;
});

function atualizarMiraPorJoystick() {
  if (!joystickAtivo || !aviao) return;

  targetCameraX.value = aviao.position.x * 0.3;

  cursor3D.position.x += joystickVetor.x * JOYSTICK_VELOCIDADE;
  cursor3D.position.y -= joystickVetor.y * JOYSTICK_VELOCIDADE; // eixo Y da tela é invertido

  // No mobile usamos os limites calculados para a tela do celular; no desktop
  // o comportamento é exatamente o mesmo de antes (LIMITE_X/Y_MIN/MAX).
  const xMin = isMobile ? LIMITE_X_MIN_MOBILE : LIMITE_X_MIN;
  const xMax = isMobile ? LIMITE_X_MAX_MOBILE : LIMITE_X_MAX;
  const yMin = isMobile ? LIMITE_Y_MIN_MOBILE : LIMITE_Y_MIN;
  const yMax = isMobile ? LIMITE_Y_MAX_MOBILE : LIMITE_Y_MAX;

  cursor3D.position.x = THREE.MathUtils.clamp(cursor3D.position.x, xMin, xMax);
  cursor3D.position.y = THREE.MathUtils.clamp(cursor3D.position.y, yMin, yMax);

  targetPoint.copy(cursor3D.position);
}

//-----------------------------------------------------------------------------------------------
//Carregar inimigos e criar bounding box
//-----------------------------------------------------------------------------------------------

let fighter = null;
let fighter2 = null;

let asset = {
  object: null,
  loaded: false,
  bb: new THREE.Box3(),
  bbHelper: null,
};

let asset2 = {
  object: null,
  loaded: false,
  bb: new THREE.Box3(),
  bbHelper: null,
};

loader.load("./assets/destroyer.glb", function (gltf) {
  fighter = gltf.scene;
  // use posição do avião se disponível, senão fallback para câmera.z
  const aviaoZ = aviao ? aviao.position.z : camera.position.z;
  fighter.position.set(-300, 30, aviaoZ - 100);
  fighter.rotation.y = 0;
  fighter.scale.set(0.5, 0.5, 0.5);
  scene.add(fighter);
  asset.object = fighter;
  asset.loaded = true;
  asset.bb.setFromObject(fighter);
  fighter.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  fighter2 = fighter.clone();
  fighter2.position.set(300, 40, aviaoZ - 100);
  fighter2.rotation.y = Math.PI;
  asset2.object = fighter2;
  asset2.loaded = true;
  asset2.bb.setFromObject(fighter2);
  scene.add(fighter2);
});

//-----------------------------------------------------------------------------------------------
//Tiros inimigos
//-----------------------------------------------------------------------------------------------

const tirosInimigos = [];
let vidaState = { contadorColisoesAviao: 0 };
let estadoFighters = { fighterAbatido: false, fighter2Abatido: false };

function reiniciarIntervalos() {
  clearInterval(spawnInterval);
  clearInterval(intervaloTiroFighter);
  clearInterval(intervaloTiroFighter2);

  spawnInterval = setInterval(() => {
    spawnProximoFighter(
      scene,
      aviao,
      camera,
      fighter,
      fighter2,
      asset,
      asset2,
      estadoFighters,
    );
  }, INTERVALO_FIGHTERS);

  intervaloTiroFighter = setInterval(() => {
    if (
      asset.loaded &&
      !estadoFighters.fighterAbatido &&
      podeInimigoAtirar(asset.bb, camera)
    )
      cloneTiroInimigo(fighter, aviao, scene, tirosInimigos);
  }, CADENCIA_TIRO);

  intervaloTiroFighter2 = setInterval(() => {
    if (
      asset2.loaded &&
      !estadoFighters.fighter2Abatido &&
      podeInimigoAtirar(asset2.bb, camera)
    )
      cloneTiroInimigo(fighter2, aviao, scene, tirosInimigos);
  }, CADENCIA_TIRO);
}

//-----------------------------------------------------------------------------------------------
//Criar estrutura de tiros player e animação para dispará-los
//-----------------------------------------------------------------------------------------------

const tirosPlayer = [];

let intervaloDisparo = null;
let contadorFightersAbatidos = 0;

function atirar() {
  if (!aviao) return; // aguardar avião carregar
  playSound("./assets/audio/gun-shot.mp3");
  const tiro = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 8),
    new THREE.MeshBasicMaterial({ color: "blue" }),
  );

  const posicaoMundial = new THREE.Vector3();
  aviao.getWorldPosition(posicaoMundial);
  posicaoMundial.y += 1;
  posicaoMundial.z -= 7;
  tiro.position.copy(posicaoMundial);

  // Calcular direção do tiro até o cursor (target)
  const direcao = posicaoMundial.clone().sub(cursor3D.position).normalize();
  direcao.x *= -1; // Inverter eixo X
  direcao.y *= -1; // Inverter eixo Y

  // Girar o tiro para apontar para o target
  tiro.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direcao);

  const bb = new THREE.Box3().setFromObject(tiro);
  scene.add(tiro);
  tirosPlayer.push({ mesh: tiro, bb, direcao, velocidade: 2 });
}

window.addEventListener("mousedown", () => {
  if (isMobile) return; // mobile atira apenas via joystick
  if (intervaloDisparo) return;
  if (!jogoIniciado) return;
  atirar();
  intervaloDisparo = setInterval(atirar, 300);
});

window.addEventListener("mouseup", () => {
  if (isMobile) return; // mobile atira apenas via joystick
  clearInterval(intervaloDisparo);
  intervaloDisparo = null;
});

function tiroPlayerAnimacao() {
  for (let i = tirosPlayer.length - 1; i >= 0; i--) {
    const tiro = tirosPlayer[i];

    tiro.mesh.position.addScaledVector(tiro.direcao, tiro.velocidade);
    tiro.bb.setFromObject(tiro.mesh);

    let acertou = false;

    if (fighter && asset.loaded) {
      if (tiro.bb.intersectsBox(asset.bb)) {
        acertou = true;
        // Só contar se o fighter ainda não foi abatido
        if (!estadoFighters.fighterAbatido) {
          estadoFighters.fighterAbatido = true;
          contadorFightersAbatidos++;
          if (contadorFightersAbatidos % 3 === 0) {
            spawnHealthpack(contadorFightersAbatidos);
          }
        }
        // Remover o tiro imediatamente após acertar
        scene.remove(tiro.mesh);
        tiro.mesh.geometry.dispose();
        tiro.mesh.material.dispose();
        tirosPlayer.splice(i, 1);
        continue;
      }
    }

    if (!acertou && fighter2 && asset2.loaded) {
      if (tiro.bb.intersectsBox(asset2.bb)) {
        acertou = true;
        // Só contar se o fighter2 ainda não foi abatido
        if (!estadoFighters.fighter2Abatido) {
          estadoFighters.fighter2Abatido = true;
          contadorFightersAbatidos++;
          if (contadorFightersAbatidos % 3 === 0) {
            spawnHealthpack(contadorFightersAbatidos);
          }
        }
        // Remover o tiro imediatamente após acertar
        scene.remove(tiro.mesh);
        tiro.mesh.geometry.dispose();
        tiro.mesh.material.dispose();
        tirosPlayer.splice(i, 1);
        continue;
      }
    }

    if (tiro.mesh.position.z < aviao.position.z - 300) {
      scene.remove(tiro.mesh);
      tiro.mesh.geometry.dispose();
      tiro.mesh.material.dispose();
      tirosPlayer.splice(i, 1);
    }
  }
}

//-----------------------------------------------------------------------------------------------
//Pausar jogo
//-----------------------------------------------------------------------------------------------

let podeMover = true;

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && podeMover) {
    podeMover = false;
    if (!isMobile) cursor3D.visible = false;
    document.body.style.cursor = "default";
  }
});

window.addEventListener("click", (event) => {
  if (isMobile) return; // mobile não usa toque na tela para retomar o jogo
  if (!podeMover) {
    podeMover = true;
    cursor3D.visible = true;
    document.body.style.cursor = "none";
  }
});

//-----------------------------------------------------------------------------------------------
// Vida
//-----------------------------------------------------------------------------------------------

let lifeBar = document.getElementById("lifeBar");
let modoInvencivel = false;

function atualizarVida() {
  let vida;

  if (!modoInvencivel) {
    vida = 20 - vidaState.contadorColisoesAviao;
    lifeBar.style.width = `${vida * 10}px`;
  }
  if (vida <= 0) {
    mostrarGameOver();
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key === "g" || event.key === "G") {
    modoInvencivel = !modoInvencivel;

    document.getElementById("lifeBarContainer").style.display = modoInvencivel
      ? "none"
      : "block";
    document.getElementById("modoInvencivel").style.display = modoInvencivel
      ? "block"
      : "none";
  }
});
let gameOverAtivo = false;

function mostrarGameOver() {
  if (gameOverAtivo) return; // evita chamar múltiplas vezes
  gameOverAtivo = true;

  podeMover = false; // trava o jogo
  if (backgroundAudio) backgroundAudio.pause();

  const tela = document.getElementById("gameOverScreen");
  const stats = document.getElementById("gameOverStats");

  tela.style.display = "flex";

  document.getElementById("btnReiniciar").onclick = () => {
    location.reload();
  };

  document.body.style.cursor = "default";
  cursor3D.visible = false;
}
//-----------------------------------------------------------------------------------------------
//Criar água e clock para animação
//-----------------------------------------------------------------------------------------------

createWater(scene);
const clock = new THREE.Clock();

//-----------------------------------------------------------------------------------------------

window.addEventListener("iniciarJogo", () => {
  if (jogoIniciado) return; // evita iniciar duas vezes
  jogoIniciado = true;
  playBackgroundMusic();
  document.body.style.cursor = "none";

  spawnInterval = setInterval(() => {
    spawnProximoFighter(
      scene,
      aviao,
      camera,
      fighter,
      fighter2,
      asset,
      asset2,
      estadoFighters,
    );
  }, INTERVALO_FIGHTERS);
  intervaloTiroFighter = setInterval(() => {
    if (
      asset.loaded &&
      !estadoFighters.fighterAbatido &&
      podeInimigoAtirar(asset.bb, camera)
    )
      cloneTiroInimigo(fighter, aviao, scene, tirosInimigos);
  }, CADENCIA_TIRO);
  intervaloTiroFighter2 = setInterval(() => {
    if (
      asset2.loaded &&
      !estadoFighters.fighter2Abatido &&
      podeInimigoAtirar(asset2.bb, camera)
    )
      cloneTiroInimigo(fighter2, aviao, scene, tirosInimigos);
  }, CADENCIA_TIRO);
  render();
  if (!isMobile) {
    buildInterface();
  } else {
    buildInterfaceMobile();
  }
});

//-----------------------------------------------------------------------------------------------

function render() {
  stats.update();
  if (podeMover && aviao) {
    atualizarMiraPorJoystick();
    movimentacaoAviao(targetPoint, VELOCIDADE_AVIAO, aviao);
    rotacaoAviao(
      targetPoint,
      mouseMovendo,
      VELOCIDADE_ROTACAO,
      VELOCIDADE_ROTACAO_X,
      aviao,
    );
    cursor3D.position.z -= VELOCIDADE;
    updateChunks(camera, scene);
    camera.position.z -= VELOCIDADE;
    aviao.position.z -= VELOCIDADE;
    tiroPlayerAnimacao();
    tiroInimigoAnimacao(
      tirosInimigos,
      aviao,
      scene,
      modoInvencivel,
      tiroAcertouAviao,
      vidaState,
    );
    moverFighter(
      scene,
      aviao,
      camera,
      fighter,
      fighter2,
      asset,
      asset2,
      null,
      tirosInimigos,
      estadoFighters,
      VELOCIDADE_INIMIGO,
    );
    atualizarBBsAviao();
  }

  dirLight.position.set(
    camera.position.x + 40,
    camera.position.y + 60,
    camera.position.z + 10,
  );

  if (atractHealthpackToAviao()) {
    if (!modoInvencivel) {
      // Recuperar 5 pontos de vida ao pegar o healthpack
      const vidaAtual = 20 - vidaState.contadorColisoesAviao;
      const vidaNova = Math.min(vidaAtual + 5, 20);
      vidaState.contadorColisoesAviao = 20 - vidaNova;
    }
  }

  dirLight.target.position.set(
    camera.position.x,
    camera.position.y,
    camera.position.z,
  );

  atualizarVida();

  animarHealthpack(VELOCIDADE);

  const delta = clock.getDelta();
  updateWater(delta, camera);
  dirLight.target.updateMatrixWorld();
  requestAnimationFrame(render);
  renderer.render(scene, camera);
}
