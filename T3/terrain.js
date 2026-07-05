import * as THREE from "three";

import { Water } from "../build/jsm/objects/Water.js"; // Water shader in here
import { loadingManager } from "./loadingManager.js";

//-----------------------------------------------------------------------------------------------
// Funções auxiliares para modelagem procedural do terreno
//-----------------------------------------------------------------------------------------------

// ── Configuração de chunks ─────────────────────────────────────

const CHUNK_SIZE = 50;
const SEGS = 64;
const RENDER_DIST = 4;
const seed = Math.random() * 1000;

const chunks = new Map();

// ── Noise ──────────────────────────────────────────────────────
function hash(x, y) {
  // seno determinístico, sem depender de operações bit a bit em floats grandes
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a, b, t) {
  return a + t * (b - a);
}
function grad(ix, iy, x, y) {
  const g = hash(ix, iy) * 6.28318;
  return Math.cos(g) * (x - ix) + Math.sin(g) * (y - iy);
}
function noise2(x, y) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  return lerp(
    lerp(grad(ix, iy, x, y), grad(ix + 1, iy, x, y), fade(fx)),
    lerp(grad(ix, iy + 1, x, y), grad(ix + 1, iy + 1, x, y), fade(fx)),
    fade(fy),
  );
}
function fbm(x, y, octaves = 4) {
  let v = 0,
    amp = 1,
    freq = 1,
    max = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2(x * freq, y * freq);
    max += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return v / max;
}

// ── Altura do mundo em (wx, wz) ────────────────────────────────

const AMP = 35;

function getWorldHeight(wx, wz) {
  const SCALE = 0.04;
  const dwx = fbm(
    (wx + seed + 5.2) * SCALE * 0.8,
    (wz + seed + 1.3) * SCALE * 0.8,
    2,
  );
  const dwz = fbm(
    (wx + seed + 8.1) * SCALE * 0.8,
    (wz + seed + 3.7) * SCALE * 0.8,
    2,
  );
  let h = fbm((wx + seed) * SCALE + dwx * 1.5, (wz + seed) * SCALE + dwz * 1.5);
  return Math.pow(Math.max(0, h + 0.1), 1.2) * AMP;
}

// Nível do mar / água. Tudo abaixo disso fica submerso pelo plano de água.
const sandLevel = AMP * 0.08;
const grassLevel = AMP * 0.3;
const snowLevel = AMP * 0.6;
const SEA_LEVEL = sandLevel * 0.15;

//-----------------------------------------------------------------------------------------------
// Texturas do terreno — carregadas de arquivos reais (PBR-like albedo maps)
//-----------------------------------------------------------------------------------------------

const textureLoader = new THREE.TextureLoader(loadingManager);

function loadTex(path, repeat = 10) {
  const tex = textureLoader.load(path);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4; // volta pra 4 — geralmente já resolve 90% do aliasing
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

// ATENÇÃO: no seu snippet, texForest e texSnow apontam para o mesmo arquivo
// ('assets/neve.jpg'). Mantive os dois carregamentos (cada um com seu próprio
// objeto de textura/repeat), mas verifique se texForest não deveria apontar
// para uma textura de grama de floresta / vegetação densa em vez de neve.
const texSand = loadTex("assets/sand.jpg", 10);
const texGrass = loadTex("assets/grass.jpg", 16);
const texForest = loadTex("assets/forest.jpg", 5);
const texRock = loadTex("assets/stone.jpg", 20);
const texSnow = loadTex("assets/neve.jpg", 8);

//-----------------------------------------------------------------------------------------------
// Shader de blending: combina sand/grass/forest/rock/snow com base na altura
// (height) e na inclinação do terreno (slope, a partir da normal).
//-----------------------------------------------------------------------------------------------

const terrainVertexShader = /* glsl */ `
 varying vec2 vUv;
varying float vHeight;
varying vec3 vWorldNormal;
varying float vFogDepth;

void main() {
  vUv = uv;
  vHeight = position.y;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vFogDepth = -mvPosition.z;
}
`;

const terrainFragmentShader = /* glsl */ `
  uniform sampler2D sandTex;
  uniform sampler2D grassTex;
  uniform sampler2D forestTex;
  uniform sampler2D rockTex;
  uniform sampler2D snowTex;

  uniform float sandLevel;
  uniform float grassLevel;
  uniform float snowLevel;
  uniform float amp;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;

  uniform float sandRepeat;
  uniform float grassRepeat;
  uniform float forestRepeat;
  uniform float rockRepeat;
  uniform float snowRepeat;

  varying float vFogDepth;
  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorldNormal;

  void main() {
    vec3 sandColor   = texture2D(sandTex,   vUv * sandRepeat).rgb;
    vec3 grassColor  = texture2D(grassTex,  vUv * grassRepeat).rgb;
    vec3 forestColor = texture2D(forestTex, vUv * forestRepeat).rgb;
    vec3 rockColor   = texture2D(rockTex,   vUv * rockRepeat).rgb;
    vec3 snowColor   = texture2D(snowTex,   vUv * snowRepeat).rgb;

    float hn = vHeight / amp;
    float sandN = sandLevel / amp;
    float grassN = grassLevel / amp;
    float snowN = snowLevel / amp;

    float sandToGrass  = smoothstep(sandN - 0.03, sandN + 0.03, hn);
    float grassToForest = smoothstep(grassN * 0.55 - 0.05, grassN * 0.55 + 0.05, hn);
    float forestToSnow = smoothstep(snowN * 0.55 - 0.15, snowN * 0.55 + 0.05, hn);

    vec3 heightColor = mix(sandColor, grassColor, sandToGrass);
    heightColor = mix(heightColor, forestColor, grassToForest);
    heightColor = mix(heightColor, snowColor, forestToSnow);

    vec3 n = normalize(vWorldNormal);
    float slope = 1.0 - clamp(dot(n, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
    float rockFactor = smoothstep(0.35, 0.75, slope);

    float nearSand = 1.0 - sandToGrass;
    rockFactor *= (1.0 - nearSand * 0.85);

    vec3 finalColor = mix(heightColor, rockColor, rockFactor);
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    vec3 colorWithFog = mix(finalColor, fogColor, fogFactor);

    gl_FragColor = vec4(colorWithFog, 1.0);
  }
`;
function createTerrainMaterial() {
  return new THREE.ShaderMaterial({
    // no createTerrainMaterial(), adicione uniforms de repeat
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      THREE.UniformsLib.lights,
      {
        sandTex: { value: texSand },
        grassTex: { value: texGrass },
        forestTex: { value: texForest },
        rockTex: { value: texRock },
        snowTex: { value: texSnow },
        sandRepeat: { value: 1 },
        grassRepeat: { value: 1 },
        forestRepeat: { value: 3 },
        rockRepeat: { value: 5 },
        snowRepeat: { value: 1 },
        sandLevel: { value: sandLevel },
        grassLevel: { value: grassLevel },
        snowLevel: { value: snowLevel },
        amp: { value: AMP },
      },
    ]),
    vertexShader: terrainVertexShader,
    fragmentShader: terrainFragmentShader,
    lights: true, // habilita os uniforms/includes de luz e sombra
    fog: true,
  });
}
// Material único e compartilhado por todos os chunks (texturas/uniforms reutilizados)
const sharedTerrainMaterial = createTerrainMaterial();

//-----------------------------------------------------------------------------------------------
// Água — shader próprio (sem dependências de three/examples), usando
// waternormals.jpg para perturbar a normal e gerar ondulação animada,
// com um efeito de Fresnel simples (água mais clara vista de cima,
// mais "espelhada"/escura nas bordas rasantes).
//-----------------------------------------------------------------------------------------------

const waterNormalsTex = textureLoader.load(
  "../assets/textures/NormalMapping/waternormals.jpg",
);
waterNormalsTex.wrapS = waterNormalsTex.wrapT = THREE.RepeatWrapping;

const waterVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// NOTA IMPORTANTE: "cameraPosition" é uma uniform que o Three.js já injeta
// automaticamente em todo ShaderMaterial (junto com modelMatrix, viewMatrix,
// projectionMatrix etc). Declará-la de novo aqui causava um erro de
// "redefinição de variável" na compilação do GLSL, o que fazia o shader
// falhar silenciosamente e a água nunca ser desenhada. Por isso ela foi
// removida tanto do shader quanto do objeto de uniforms do material abaixo.
const waterFragmentShader = /* glsl */ `
  uniform sampler2D normalMap;
  uniform float time;
  uniform vec3 shallowColor;
  uniform vec3 deepColor;
  uniform float uvScale;
  uniform float waveSpeed;
  uniform float distortion;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vec2 uv = vUv * uvScale;

    // Duas camadas de normal map se movendo em direções/velocidades
    // diferentes, somadas, criam um padrão de ondas que não se repete
    // de forma óbvia (técnica clássica de "scrolling normal maps").
    vec2 uv1 = uv + vec2(time * waveSpeed, time * waveSpeed * 0.6);
    vec2 uv2 = uv * 1.7 - vec2(time * waveSpeed * 0.4, time * waveSpeed * 0.8);

    vec3 n1 = texture2D(normalMap, uv1).rgb * 2.0 - 1.0;
    vec3 n2 = texture2D(normalMap, uv2).rgb * 2.0 - 1.0;
    vec3 normal = normalize(vec3(n1.xy + n2.xy, 1.0));

    // Fresnel simples: quanto mais rasante o ângulo de visão, mais
    // "espelhada"/escura fica a água; visto de cima, fica mais clara.
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - clamp(dot(viewDir, normal), 0.0, 1.0), 3.0);

    vec3 baseColor = mix(shallowColor, deepColor, fresnel);

    // leve brilho especular usando a normal perturbada, simulando
    // o reflexo do céu/sol sem precisar de render target real.
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
    vec3 halfDir = normalize(viewDir + lightDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 60.0);

    vec3 finalColor = baseColor + spec * 0.6;

    gl_FragColor = vec4(finalColor, opacity);
  }
`;
//-----------------------------------------------------------------------------------------------
// Água — usando o objeto Water do three/examples, mas configurado para ser leve:
// resolução de reflexo bem baixa (32x32) já é suficiente para o efeito de
// distorção/sol, sem o custo de um render-to-texture em alta resolução.
//-----------------------------------------------------------------------------------------------

const WATER_GEOM_SIZE = (RENDER_DIST * 2 + 4) * CHUNK_SIZE;

let waterMesh = null;
let waterSunVector = new THREE.Vector3(0.5, 0.8, 0.3).normalize();

export function createWater(scene) {
  if (waterMesh) return waterMesh;

  // Geometria já no tamanho final (evita escalar e ter que recalcular o
  // mirror camera do Water toda hora — só reposicionamos no updateWater).
  const waterGeometry = new THREE.PlaneGeometry(
    WATER_GEOM_SIZE,
    WATER_GEOM_SIZE,
  );

  waterMesh = new Water(waterGeometry, {
    // resolução do render target de reflexo: maior valor reduz tremulação
    textureWidth: 256,
    textureHeight: 256,
    waterNormals: new THREE.TextureLoader().load(
      "../assets/textures/NormalMapping/waternormals.jpg",
      function (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
      },
    ),
    sunDirection: waterSunVector,
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 6,
    size: 25,
    fog: !!scene.fog,
  });

  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = SEA_LEVEL;

  scene.add(waterMesh);
  return waterMesh;
}

// Chame a cada frame, passando o delta de tempo e a câmera, para animar as
// ondas e manter a água acompanhando a posição da câmera no plano XZ.
export function updateWater(delta, camera) {
  if (!waterMesh) return;

  waterMesh.material.uniforms["time"].value += delta;

  // "Água infinita": acompanha a câmera no plano XZ (a geometria já tem o
  // tamanho final, então só reposicionamos, sem escalar).
  waterMesh.position.x = camera.position.x;
  waterMesh.position.z = camera.position.z;
}
//-----------------------------------------------------------------------------------------------
//Primeiro modelo de árvore
//-----------------------------------------------------------------------------------------------
// Materiais e geometrias compartilhados — criados 1x só
const trunkGeoTree = new THREE.CylinderGeometry(0.1, 0.25, 2.5, 6);
const trunkMatTree = new THREE.MeshStandardMaterial({
  color: 0x8b5e3c,
  roughness: 0.9,
});
const foliageMatTree = new THREE.MeshStandardMaterial({
  color: 0x2d6b18,
  roughness: 0.8,
});
const treeLayerGeos = [
  { geo: new THREE.ConeGeometry(1.8, 2.2, 7), y: 2.0 },
  { geo: new THREE.ConeGeometry(1.4, 2.0, 7), y: 3.4 },
  { geo: new THREE.ConeGeometry(0.9, 1.8, 7), y: 4.6 },
];

function createTree() {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(trunkGeoTree, trunkMatTree);
  trunk.position.y = 1.25;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  for (const l of treeLayerGeos) {
    const cone = new THREE.Mesh(l.geo, foliageMatTree);
    cone.position.y = l.y;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
  }

  return group;
}

//-----------------------------------------------------------------------------------------------
//Segundo modelo de árvore
//-----------------------------------------------------------------------------------------------

function createPalmeira() {
  const group = new THREE.Group();

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x553723,
    roughness: 0.9,
  });
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.2, 4, 32);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x29492c,
    roughness: 0.8,
  });

  const layers = [
    { r: 0.8, y: 4.8 },
    { r: 1.0, y: 4.3 },
    { r: 1.3, y: 3.5 },
  ];

  for (const l of layers) {
    const geo = new THREE.SphereGeometry(l.r, 16, 16);
    const mesh = new THREE.Mesh(geo, foliageMat);
    mesh.position.y = l.y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

//-----------------------------------------------------------------------------------------------
//Função para clonar e espalhar árvores no terreno
//-----------------------------------------------------------------------------------------------

function snapToGrid(lx, lz) {
  const step = CHUNK_SIZE / SEGS;
  const snappedX = Math.round(lx / step) * step;
  const snappedZ = Math.round(lz / step) * step;
  return { x: snappedX, z: snappedZ };
}

function spawnTreesInChunk(cx, cz, chunkGroup) {
  const rng = (() => {
    let s = Math.abs(Math.sin(cx * 127.1 + cz * 311.7 + seed) * 43758.5453) % 1;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  })();

  const treeCount = 10 + Math.floor(rng() * 6);
  const DIST_MIN = 3;
  const posicionadas = [];

  for (let i = 0; i < treeCount; i++) {
    const lx = (rng() - 0.5) * CHUNK_SIZE;
    const lz = (rng() - 0.5) * CHUNK_SIZE;

    const { x: sx, z: sz } = snapToGrid(lx, lz);
    const wx = sx + cx * CHUNK_SIZE;
    const wz = sz + cz * CHUNK_SIZE;
    const h = getWorldHeight(wx, wz);

    // não nasce árvore submersa pela água nem acima da linha de grama
    if (h <= Math.max(sandLevel, SEA_LEVEL) || h >= grassLevel) continue;

    const sobrepos = posicionadas.some(
      (p) => Math.hypot(lx - p.x, lz - p.z) < DIST_MIN,
    );
    if (sobrepos) continue;

    posicionadas.push({ x: lx, z: lz });

    const escala = 0.3 + rng() * 0.2;
    const tree = rng() < 0.5 ? createTree() : createPalmeira();

    tree.position.set(sx, h, sz);
    tree.scale.setScalar(escala);
    tree.rotation.y = rng() * Math.PI * 2;

    chunkGroup.add(tree);
  }
}

//-----------------------------------------------------------------------------------------------
//Função para criar os chunks do terreno com árvores
//-----------------------------------------------------------------------------------------------

export function createChunk(cx, cz, scene) {
  const key = `${cx},${cz}`;
  if (chunks.has(key)) return;

  const group = new THREE.Group();
  group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

  const SEGS_EXT = SEGS + 3;
  const step = CHUNK_SIZE / SEGS;

  const positions = [];
  const uvs = [];
  const normals = [];
  const indices = [];

  for (let iz = 0; iz < SEGS_EXT; iz++) {
    for (let ix = 0; ix < SEGS_EXT; ix++) {
      const lx = (ix - 1) * step - CHUNK_SIZE / 2;
      const lz = (iz - 1) * step - CHUNK_SIZE / 2;
      const wx = lx + cx * CHUNK_SIZE;
      const wz = lz + cz * CHUNK_SIZE;
      const h = getWorldHeight(wx, wz);

      positions.push(lx, h, lz);
      // UV em espaço de mundo, para que a textura seja contínua entre chunks
      // (a repetição/tiling de cada textura é controlada por texture.repeat em loadTex)
      uvs.push(wx / CHUNK_SIZE, wz / CHUNK_SIZE);
      normals.push(0, 1, 0);
    }
  }

  for (let iz = 0; iz < SEGS_EXT - 1; iz++) {
    for (let ix = 0; ix < SEGS_EXT - 1; ix++) {
      const a = iz * SEGS_EXT + ix;
      const b = a + 1;
      const c = a + SEGS_EXT;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);

  geo.computeVertexNormals();

  // Recorta a borda extra (usada apenas para calcular normais suaves
  // contínuas entre chunks vizinhos), mantendo só o miolo SEGS x SEGS.
  const innerPos = [];
  const innerUvs = [];
  const innerNorms = [];
  const innerIdx = [];

  const innerSegs = SEGS;
  const innerVerts = innerSegs + 1;

  const posArr = geo.attributes.position.array;
  const uvArr = geo.attributes.uv.array;
  const normArr = geo.attributes.normal.array;

  for (let iz = 0; iz < innerVerts; iz++) {
    for (let ix = 0; ix < innerVerts; ix++) {
      const srcIdx = (iz + 1) * SEGS_EXT + (ix + 1);
      innerPos.push(
        posArr[srcIdx * 3],
        posArr[srcIdx * 3 + 1],
        posArr[srcIdx * 3 + 2],
      );
      innerUvs.push(uvArr[srcIdx * 2], uvArr[srcIdx * 2 + 1]);
      innerNorms.push(
        normArr[srcIdx * 3],
        normArr[srcIdx * 3 + 1],
        normArr[srcIdx * 3 + 2],
      );
    }
  }

  for (let iz = 0; iz < innerSegs; iz++) {
    for (let ix = 0; ix < innerSegs; ix++) {
      const a = iz * innerVerts + ix;
      const b = a + 1;
      const c = a + innerVerts;
      const d = c + 1;
      innerIdx.push(a, c, b, b, c, d);
    }
  }

  geo.dispose();

  const finalGeo = new THREE.BufferGeometry();
  finalGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(innerPos, 3),
  );
  finalGeo.setAttribute("uv", new THREE.Float32BufferAttribute(innerUvs, 2));
  finalGeo.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(innerNorms, 3),
  );
  finalGeo.setIndex(innerIdx);

  // Material de shader compartilhado: combina sand/grass/forest/rock/snow
  // de acordo com altura (vHeight) e inclinação (vWorldNormal) no fragment shader.
  const mesh = new THREE.Mesh(finalGeo, sharedTerrainMaterial);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);

  spawnTreesInChunk(cx, cz, group);
  scene.add(group);
  chunks.set(key, group);
}

//-----------------------------------------------------------------------------------------------
//Função para destruir os chunks do terreno passados
//-----------------------------------------------------------------------------------------------
export function destroyChunk(key, scene) {
  const group = chunks.get(key);
  if (!group) return;
  scene.remove(group);
  group.traverse((obj) => {
    // só faz dispose da geometria do terreno (finalGeo), que é única por chunk;
    // geometrias/materiais de árvores agora são compartilhados e não devem ser destruídos
    if (obj.geometry && obj === group.children[0]) {
      obj.geometry.dispose();
    }
  });
  chunks.delete(key);
}
//-----------------------------------------------------------------------------------------------
//Função para animar o terreno
//-----------------------------------------------------------------------------------------------

const chunkQueue = [];
const CHUNKS_PER_FRAME = 2;

export function updateChunks(camera, scene) {
  const cx = Math.round(camera.position.x / CHUNK_SIZE);
  const cz = Math.round(camera.position.z / CHUNK_SIZE);

  for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
    for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
      const key = `${cx + dx},${cz + dz}`;
      if (!chunks.has(key) && !chunkQueue.find((c) => c.key === key)) {
        const dist = Math.abs(dx) + Math.abs(dz);
        chunkQueue.push({ key, cx: cx + dx, cz: cz + dz, dist });
      }
    }
  }

  chunkQueue.sort((a, b) => a.dist - b.dist);

  let created = 0;
  while (chunkQueue.length > 0 && created < CHUNKS_PER_FRAME) {
    const { cx: ccx, cz: ccz } = chunkQueue.shift();
    createChunk(ccx, ccz, scene);
    created++;
  }

  for (const [key] of chunks) {
    const [kcx, kcz] = key.split(",").map(Number);
    if (Math.abs(kcx - cx) > RENDER_DIST || Math.abs(kcz - cz) > RENDER_DIST) {
      destroyChunk(key, scene);
    }
  }
}
