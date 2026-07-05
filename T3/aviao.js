import * as THREE from "three";

//-----------------------------------------------------------------------------------------------
// Função de movimentação do avião em X e Y
//-----------------------------------------------------------------------------------------------

const LIMITE_X_MIN = -70;
const LIMITE_X_MAX = 70;
const LIMITE_Y_MIN = 5;
const LIMITE_Y_MAX = 30;

export function movimentacaoAviao(targetPoint, velocidade, aviao) {
  aviao.position.x += (targetPoint.x - aviao.position.x) * velocidade;
  aviao.position.y += (targetPoint.y - aviao.position.y) * velocidade;

  aviao.position.x = THREE.MathUtils.clamp(
    aviao.position.x,
    LIMITE_X_MIN,
    LIMITE_X_MAX,
  );
  aviao.position.y = THREE.MathUtils.clamp(
    aviao.position.y,
    LIMITE_Y_MIN,
    LIMITE_Y_MAX,
  );
}
////-----------------------------------------------------------------------------------------------
//// Função de rotação do avião em Z
////-----------------------------------------------------------------------------------------------
let velocidadeRotacao = 0;
let velocidadeRotacaoX = 0;
let velocidadeRotacaoY = 0; // adiciona essa
let baseRotationY = null;

export function rotacaoAviao(
  targetPoint,
  mouseMovendo,
  velocidade,
  velocidadeX,
  aviao,
) {
  if (baseRotationY === null) baseRotationY = aviao.rotation.y;

  const delta = targetPoint.x - aviao.position.x;
  const deltaZ = targetPoint.y - aviao.position.y;

  const zonaSensibilidadeY = 10;
  const zonaSensibilidadeX = 10;

  const maxRotacaoZ = 0.8;
  const maxRotacaoX = 0.3;
  const maxRotacaoY = 0.15;

  let rotacaoAlvo = 0;
  let rotacaoAlvoX = 0;
  let rotacaoAlvoY = 0;

  if (mouseMovendo) {
    const ratioZ = Math.max(-1, Math.min(1, delta / zonaSensibilidadeY));
    const ratioX = Math.max(-1, Math.min(1, deltaZ / zonaSensibilidadeX));
    const ratioY = Math.max(-1, Math.min(1, delta / zonaSensibilidadeY));

    rotacaoAlvo =
      Math.sign(ratioZ) * Math.pow(Math.abs(ratioZ), 2) * maxRotacaoZ;
    rotacaoAlvoX =
      Math.sign(ratioX) * Math.pow(Math.abs(ratioX), 2) * maxRotacaoX;
    rotacaoAlvoY =
      Math.sign(ratioY) * Math.pow(Math.abs(ratioY), 2) * maxRotacaoY;
  }

  velocidadeRotacao += (rotacaoAlvo - velocidadeRotacao) * velocidade;
  velocidadeRotacaoX += (rotacaoAlvoX - velocidadeRotacaoX) * velocidadeX;
  velocidadeRotacaoY += (rotacaoAlvoY - velocidadeRotacaoY) * velocidade; // mesma inércia do Z

  aviao.rotation.z += (velocidadeRotacao - aviao.rotation.z) * velocidade;
  aviao.rotation.x += (velocidadeRotacaoX - aviao.rotation.x) * velocidadeX;
  aviao.rotation.y +=
    (baseRotationY + velocidadeRotacaoY - aviao.rotation.y) * velocidade;
}
//-----------------------------------------------------------------------------------------------
