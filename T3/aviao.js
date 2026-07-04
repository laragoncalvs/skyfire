import * as THREE from "three";

//-----------------------------------------------------------------------------------------------
//Modelagem do avião
//-----------------------------------------------------------------------------------------------

let materialAzulAviao = new THREE.MeshPhongMaterial({ color: "blue", shininess: "200", specular:"white" });
let materialBrancoAviao = new THREE.MeshPhongMaterial({ color: "white", shininess: "200", specular:"white"   });
let materialAzulEscuroAviao = new THREE.MeshPhongMaterial({ color: "darkblue", shininess: "200", specular:"white"   });

let corpoAviaoGeometry = new THREE.CylinderGeometry(1, 1, 9, 8);
let corpoAviao = new THREE.Mesh(corpoAviaoGeometry, materialAzulAviao);
corpoAviao.rotation.z = Math.PI / 2.0;
corpoAviao.rotation.y = Math.PI / 2.0;
corpoAviao.position.set(0.0, 2.0, -1.0);

let asaAviaoGeometryEsq = new THREE.SphereGeometry(2, 32, 32, 0, 3.14);
let asaAviaoEsq = new THREE.Mesh(asaAviaoGeometryEsq, materialBrancoAviao);
asaAviaoEsq.scale.set(0.5, 0.1, 4);
asaAviaoEsq.rotation.y = Math.PI / 1.7;
asaAviaoEsq.position.set(0.0, 2.0, 1.0);

let asaAviaoGeometryDir = new THREE.SphereGeometry(2, 32, 32, 0, 3.14);
let asaAviaoDir = new THREE.Mesh(asaAviaoGeometryDir, materialBrancoAviao);
asaAviaoDir.scale.set(0.5, 0.1, 4);
asaAviaoDir.rotation.y = -Math.PI / 1.7;
asaAviaoDir.position.set(0.0, 2.0, 1.0);

let cabineAviaoGeometry = new THREE.SphereGeometry(1, 32, 32);
let cabineAviao = new THREE.Mesh(cabineAviaoGeometry, materialAzulAviao);
cabineAviao.position.set(0.0, 2.0, 4);
cabineAviao.scale.set(1, 1, 4);

let caudaAviaoGeometry = new THREE.SphereGeometry(1, 32, 32);
let caudaAviao = new THREE.Mesh(caudaAviaoGeometry, materialAzulAviao);
caudaAviao.scale.set(1.0, 1.0, 5.0);
caudaAviao.position.set(0.0, 2.0, -4);

let capsulaTiros = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,1.0), materialAzulAviao);
capsulaTiros.position.set(0.0, 0.8, 5.0);
capsulaTiros.rotation.x = Math.PI/2;


let asaCaudaAviaoGeometryEsq = new THREE.SphereGeometry(2, 32, 32, 0, 3.14);
let asaCaudaAviaoEsq = new THREE.Mesh(
  asaCaudaAviaoGeometryEsq,
  materialBrancoAviao,
);
asaCaudaAviaoEsq.scale.set(0.3, 0.01, 1.5);
asaCaudaAviaoEsq.rotation.y = Math.PI / 1.7;
asaCaudaAviaoEsq.position.set(0.0, 2.0, -8);

let asaCaudaAviaoGeometryDir = new THREE.SphereGeometry(2, 32, 32, 0, 3.14);
let asaCaudaAviaoDir = new THREE.Mesh(
  asaCaudaAviaoGeometryDir,
  materialBrancoAviao,
);
asaCaudaAviaoDir.scale.set(0.3, 0.01, 1.5);
asaCaudaAviaoDir.rotation.y = -Math.PI / 1.7;
asaCaudaAviaoDir.position.set(0.0, 2.0, -8);

let asaCaudaAviaoGeometry = new THREE.SphereGeometry(2, 32, 32, 0, 3.14);
let asaCaudaAviao = new THREE.Mesh(
  asaCaudaAviaoGeometry,
  materialAzulEscuroAviao,
);
asaCaudaAviao.scale.set(0.5, 0.1, 1.9);
asaCaudaAviao.rotation.z = Math.PI / 2;
asaCaudaAviao.rotation.x = -Math.PI / 1.5;
asaCaudaAviao.position.set(0.0, 2.0, -7.2);

let aviao = new THREE.Group();
aviao.add(corpoAviao);
aviao.add(asaAviaoEsq);
aviao.add(asaAviaoDir);
aviao.add(cabineAviao);
aviao.add(caudaAviao);
aviao.add(asaCaudaAviaoEsq);
aviao.add(asaCaudaAviaoDir);
aviao.add(asaCaudaAviao);
aviao.add(capsulaTiros);

aviao.rotation.y = Math.PI / 1.0;
aviao.position.y = 20;



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

  aviao.position.x = THREE.MathUtils.clamp(aviao.position.x, LIMITE_X_MIN, LIMITE_X_MAX);
  aviao.position.y = THREE.MathUtils.clamp(aviao.position.y, LIMITE_Y_MIN, LIMITE_Y_MAX);
}
////-----------------------------------------------------------------------------------------------
//// Função de rotação do avião em Z
////-----------------------------------------------------------------------------------------------
let velocidadeRotacao = 0;
let velocidadeRotacaoX = 0;
let velocidadeRotacaoY = 0; // adiciona essa
let baseRotationY = null;

export function rotacaoAviao(targetPoint, mouseMovendo, velocidade, velocidadeX, aviao) {
  if (baseRotationY === null) baseRotationY = aviao.rotation.y;

  const delta  = targetPoint.x - aviao.position.x;
  const deltaZ = targetPoint.y - aviao.position.y;

  const zonaSensibilidadeY = 10;
  const zonaSensibilidadeX = 10;

  const maxRotacaoZ = 0.8;
  const maxRotacaoX = 0.3;
  const maxRotacaoY = 0.15;

  let rotacaoAlvo  = 0;
  let rotacaoAlvoX = 0;
  let rotacaoAlvoY = 0;

  if (mouseMovendo) {
    const ratioZ = Math.max(-1, Math.min(1, delta  / zonaSensibilidadeY));
    const ratioX = Math.max(-1, Math.min(1, deltaZ / zonaSensibilidadeX));
    const ratioY = Math.max(-1, Math.min(1, delta  / zonaSensibilidadeY));

    rotacaoAlvo  = Math.sign(ratioZ) * Math.pow(Math.abs(ratioZ), 2) * maxRotacaoZ;
    rotacaoAlvoX = Math.sign(ratioX) * Math.pow(Math.abs(ratioX), 2) * maxRotacaoX;
    rotacaoAlvoY = Math.sign(ratioY) * Math.pow(Math.abs(ratioY), 2) * maxRotacaoY;
  }

  velocidadeRotacao  += (rotacaoAlvo  - velocidadeRotacao)  * velocidade;
  velocidadeRotacaoX += (rotacaoAlvoX - velocidadeRotacaoX) * velocidadeX;
  velocidadeRotacaoY += (rotacaoAlvoY - velocidadeRotacaoY) * velocidade; // mesma inércia do Z

  aviao.rotation.z += (velocidadeRotacao  - aviao.rotation.z) * velocidade;
  aviao.rotation.x += (velocidadeRotacaoX - aviao.rotation.x) * velocidadeX;
  aviao.rotation.y += (baseRotationY + velocidadeRotacaoY - aviao.rotation.y) * velocidade;
}
//-----------------------------------------------------------------------------------------------

aviao.traverse((child) => {
  if (child.isMesh) {
    child.castShadow = true;
    child.receiveShadow = true;
  }
});




export { aviao };

