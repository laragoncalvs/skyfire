import * as THREE from "three";

let spawnQueue = ["fighter", "fighter2"];
let currentSpawnIndex = 0;
let fighterExplosionPlayed = false;
let fighter2ExplosionPlayed = false;
const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();
const movimentosFighters = new Map();

export function spawnProximoFighter(
  scene,
  aviao,
  camera,
  fighter,
  fighter2,
  asset,
  asset2,
  estadoFighters,
) {
  const tipo = spawnQueue[currentSpawnIndex % spawnQueue.length];
  currentSpawnIndex++;
  const aviaoZ = aviao ? aviao.position.z : camera.position.z;

  if (tipo === "fighter" && !estadoFighters.fighterAbatido) {
    fighter.position.set(-200, 30, aviaoZ - 100);
    asset.loaded = true;
    scene.add(fighter);
  } else if (tipo === "fighter2" && !estadoFighters.fighter2Abatido) {
    fighter2.position.set(200, 40, aviaoZ - 100);
    asset2.loaded = true;
    scene.add(fighter2);
  }
}

function obterYAlvoInimigo(inimigo, yBase) {
  if (!inimigo) return yBase;

  if (!movimentosFighters.has(inimigo)) {
    movimentosFighters.set(inimigo, {
      targetY: yBase + (Math.random() - 0.5) * 10,
      timer: 20 + Math.random() * 25,
      phase: Math.random() * Math.PI * 2,
      amplitude: 2 + Math.random() * 3,
    });
  }

  const estado = movimentosFighters.get(inimigo);
  estado.timer -= 1;

  if (estado.timer <= 0) {
    estado.targetY = yBase + (Math.random() - 0.5) * 10;
    estado.timer = 20 + Math.random() * 25;
    estado.phase += 0.35 + Math.random() * 0.3;
  }

  const onda = Math.sin(estado.phase + estado.timer * 0.05) * estado.amplitude;
  const variacao =
    Math.sin(estado.phase * 0.7 + estado.timer * 0.03) *
    (estado.amplitude * 0.4);

  return estado.targetY + onda + variacao;
}

function playSound(url) {
  const audio = new Audio(url);

  audio.volume = 0.8;
  audio.currentTime = 0;

  audio.play().catch(console.error);
}

export function moverFighter(
  scene,
  aviao,
  camera,
  fighter,
  fighter2,
  asset,
  asset2,
  movimentosFighters,
  tirosInimigos,
  estadoFighters,
  VELOCIDADE_INIMIGO,
) {
  if (!fighter && !fighter2) return;

  if (fighter) {
    const alvo1 = new THREE.Vector3(
      200,
      obterYAlvoInimigo(fighter, aviao.position.y),
      aviao.position.z - 100,
    );

    if (!estadoFighters.fighterAbatido) {
      fighter.position.lerp(alvo1, VELOCIDADE_INIMIGO);
    }

    if (estadoFighters.fighterAbatido) {
      if (!fighterExplosionPlayed) {
        playSound("./assets/audio/loud-explosion-sound.mp3");
        fighterExplosionPlayed = true;
      }
      fighter.position.y -= 0.3;
      fighter.rotation.x += 0.1;
    }

    if (fighter.position.y < -20) {
      scene.remove(fighter);
      fighter.rotation.y = 0;
      fighter.rotation.x = 0;
      for (let i = tirosInimigos.length - 1; i >= 0; i--) {
        if (tirosInimigos[i].origem === fighter) {
          scene.remove(tirosInimigos[i].mesh);
          tirosInimigos[i].mesh.geometry.dispose();
          tirosInimigos[i].mesh.material.dispose();
          tirosInimigos.splice(i, 1);
        }
      }
      asset.loaded = false;
      estadoFighters.fighterAbatido = false; // <- agora realmente reseta no main.js também
      fighterExplosionPlayed = false;
    }

    asset.bb.setFromObject(fighter);

    if (fighter.position.z > camera.position.z) {
      for (let i = tirosInimigos.length - 1; i >= 0; i--) {
        if (tirosInimigos[i].origem === fighter) {
          scene.remove(tirosInimigos[i].mesh);
          tirosInimigos[i].mesh.geometry.dispose();
          tirosInimigos[i].mesh.material.dispose();
          tirosInimigos.splice(i, 1);
        }
      }
      scene.remove(fighter);
      asset.loaded = false;
      estadoFighters.fighterAbatido = false;
      fighterExplosionPlayed = false;
    }
  }

  if (fighter2) {
    const alvo2 = new THREE.Vector3(
      -200,
      obterYAlvoInimigo(fighter2, aviao.position.y),
      aviao.position.z - 100,
    );

    if (!estadoFighters.fighter2Abatido) {
      fighter2.position.lerp(alvo2, VELOCIDADE_INIMIGO);
    }

    if (estadoFighters.fighter2Abatido) {
      if (!fighter2ExplosionPlayed) {
        playSound("./assets/audio/loud-explosion-sound.mp3");
        fighter2ExplosionPlayed = true;
      }
      fighter2.position.y -= 0.3;
      fighter2.rotation.x -= 0.1;
    }

    if (fighter2.position.z > camera.position.z + 300) {
      scene.remove(fighter2);
      fighter2.rotation.y = Math.PI;
      fighter2.rotation.x = 0;
      for (let i = tirosInimigos.length - 1; i >= 0; i--) {
        if (tirosInimigos[i].origem === fighter2) {
          scene.remove(tirosInimigos[i].mesh);
          tirosInimigos[i].mesh.geometry.dispose();
          tirosInimigos[i].mesh.material.dispose();
          tirosInimigos.splice(i, 1);
        }
      }
      asset2.loaded = false;
      estadoFighters.fighter2Abatido = false;
      fighter2ExplosionPlayed = false;
    }

    asset2.bb.setFromObject(fighter2);

    if (fighter2.position.x < -150) {
      for (let i = tirosInimigos.length - 1; i >= 0; i--) {
        if (tirosInimigos[i].origem === fighter2) {
          scene.remove(tirosInimigos[i].mesh);
          tirosInimigos[i].mesh.geometry.dispose();
          tirosInimigos[i].mesh.material.dispose();
          tirosInimigos.splice(i, 1);
        }
      }
      scene.remove(fighter2);
      asset2.loaded = false;
      estadoFighters.fighter2Abatido = false;
      fighter2ExplosionPlayed = false;
    }
  }
}

//-----------------------------------------------------------------------------------------------
//Criar estrutura de tiros inimigos e animação para dispará-los
//-----------------------------------------------------------------------------------------------

function fighterVisivelNaTela(bb, camera) {
  projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  frustum.setFromProjectionMatrix(projScreenMatrix);
  return frustum.intersectsBox(bb);
}

// No desktop mantém o comportamento original (sempre pode atirar).
// No mobile, só atira quando o fighter está visível na tela.
export function podeInimigoAtirar(bb, camera) {
  return fighterVisivelNaTela(bb, camera);
}

export function cloneTiroInimigo(spaceShip, aviao, scene, tirosInimigos) {
  if (!spaceShip) return;
  if (!aviao) return; // precisa do avião para mirar

  const clone = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 3, 16),
    new THREE.MeshBasicMaterial({ color: "red" }),
  );

  const posicaoMundial = new THREE.Vector3();
  spaceShip.getWorldPosition(posicaoMundial);
  clone.position.copy(posicaoMundial);

  // Posição atual do avião
  const alvo = new THREE.Vector3();
  aviao.getWorldPosition(alvo);

  // Direção do tiro até o avião
  const direcao = alvo.clone().sub(posicaoMundial).normalize();

  // Girar o cone para apontar para o avião
  clone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direcao);

  const bb = new THREE.Box3().setFromObject(clone);

  scene.add(clone);

  tirosInimigos.push({
    mesh: clone,
    bb,
    direcao,
    velocidade: 2,
    origem: spaceShip,
  });
}
export function tiroInimigoAnimacao(
  tirosInimigos,
  aviao,
  scene,
  modoInvencivel,
  tiroAcertouAviao,
  vidaState,
) {
  for (let i = tirosInimigos.length - 1; i >= 0; i--) {
    const tiro = tirosInimigos[i];

    tiro.mesh.position.addScaledVector(tiro.direcao, tiro.velocidade);
    tiro.bb.setFromObject(tiro.mesh);

    if (tiroAcertouAviao(tiro.bb)) {
      playSound("./assets/audio/hit-player.wav");
      if (!modoInvencivel) {
        vidaState.contadorColisoesAviao++;
      }
      scene.remove(tiro.mesh);
      tiro.mesh.geometry.dispose();
      tiro.mesh.material.dispose();
      tirosInimigos.splice(i, 1);
      continue;
    }
    if (tiro.mesh.position.z > aviao.position.z + 20) {
      scene.remove(tiro.mesh);
      tiro.mesh.geometry.dispose();
      tiro.mesh.material.dispose();
      tirosInimigos.splice(i, 1);
    }
  }
}
