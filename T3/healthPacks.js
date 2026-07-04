import * as THREE from "three";
import { GLTFLoader } from "../build/jsm/loaders/GLTFLoader.js";
import { playSound } from "./railShooter.js";
import { loadingManager } from "./loadingManager.js";
//-----------------------------------------------------------------------------------------------
//Funções para movimentar e adicionar healthpacks a cena
//-----------------------------------------------------------------------------------------------
const loader = new GLTFLoader(loadingManager);

let medkit = null;
let parachute = null;
let healthpack = new THREE.Group();
let healthpackLoaded = false;
let healthpackTime = 0;
let healthpackInitialZ = 0;
let healthpackColetado = false;
let scene = null;
let aviaoRef = null;

export function initHealthpack(sceneParam, aviaoParam) {
  scene = sceneParam;
  aviaoRef = aviaoParam;

  loader.load("./assets/parachute.glb", function (gltf) {
    parachute = gltf.scene;
    parachute.position.set(0, 0, 0);
    parachute.scale.set(0.5, 0.5, 0.5);
    healthpack.add(parachute);
    
    if (medkit) {
      healthpackLoaded = true;
    }
  });

  loader.load("./assets/medkit.glb", function (gltf) {
    medkit = gltf.scene;
    medkit.position.set(0, 0, 0);
    medkit.scale.set(4, 4, 4);
    healthpack.add(medkit);
    
    if (parachute) {
      healthpackLoaded = true;
    }
  });
}

export function animarHealthpack(VELOCIDADE) {
  if (!healthpackLoaded || !medkit || !parachute) return;

  healthpackTime += 0.05;
  
  healthpack.position.y -= VELOCIDADE * 0.3;
  healthpack.position.z -= VELOCIDADE;
  
  // Movimento ondulante em X (como paraquedas oscilando)
  healthpack.position.x = Math.sin(healthpackTime) * 5;
  
  // Rotação em X para parecer caindo
  healthpack.rotation.z = Math.sin(healthpackTime) * 0.1;
  
  // Remover healthpack se passar da câmera
  if (healthpack.position.z > aviaoRef.position.z + 50) {
    scene.remove(healthpack);
    healthpackTime = 0;
  }
}


export function spawnHealthpack(contadorFightersAbatidos) {
  if (!healthpackLoaded) return;

  if (contadorFightersAbatidos % 3 === 0 && contadorFightersAbatidos !== 0) {
    // Resetar posição e rotação do healthpack
    const posicaoAleatoriaX = (Math.random() - 0.5) * 120;
    healthpack.position.set(posicaoAleatoriaX, 50, aviaoRef.position.z);
    healthpack.rotation.set(0, 0, 0);
    healthpackTime = 0;
    healthpackColetado = false;

    // Remover da cena e adicionar novamente para garantir que apareça
    scene.remove(healthpack);
    scene.add(healthpack);
  }
}


let atraindoHealthpack = false; // controla se já está no "modo ímã"

export function atractHealthpackToAviao() {
  if (!healthpackLoaded || healthpackColetado) return false;

  aviaoRef.updateMatrixWorld(true);
  healthpack.updateMatrixWorld(true);

  const aviaoBox = new THREE.Box3().setFromObject(aviaoRef);
  const distancia = aviaoBox.distanceToPoint(healthpack.position);

  if (distancia < 3) {
    // Toca o som só uma vez, ao entrar no raio de atração
    if (!atraindoHealthpack) {
      playSound("./assets/audio/magnetic.mp3");
      atraindoHealthpack = true;
    }

    // Fator de atração progressivo: quanto mais perto, mais forte "puxa"
    // Isso simula aceleração, como um ímã de verdade
    const forcaBase = 0.03;
    const forcaMax = 0.25;
    const proximidade = 1 - distancia / 5; // 0 (longe) a 1 (perto)
    const forca = forcaBase + (forcaMax - forcaBase) * proximidade;

    healthpack.position.lerp(aviaoRef.position, forca);

    if (distancia < 1) {
      // Healthpack coletado
      healthpackColetado = true;
      atraindoHealthpack = false;
      scene.remove(healthpack);
      healthpackTime = 0;
      return true;
    }
  } else {
    atraindoHealthpack = false; // saiu do raio, reseta pra tocar o som de novo se voltar
  }

  return false;
}