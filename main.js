import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { aiMove } from './ai.js';

// ---------- 规则常量 ----------
const N = 15;
const CELL = 1;            // 交叉点间距
const MARGIN = 0.9;        // 板面边缘留白
const BOARD = (N - 1) * CELL + MARGIN * 2;
const STONE_R = 0.42;
const STONE_H = STONE_R * 0.92;   // 压扁一点更像棋子

// ---------- 场景 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141922);
scene.fog = new THREE.Fog(0x141922, 40, 90);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 13, 13);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 7;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI / 2.15;

scene.add(new THREE.AmbientLight(0xbfc9dd, 0.55));
const sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
sun.position.set(12, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -12;
sun.shadow.camera.right = sun.shadow.camera.top = 12;
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 50;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x5577aa, 0.35);
fill.position.set(-10, 6, -8);
scene.add(fill);

// ---------- 棋盘（canvas 纹理：木纹 + 网格 + 星位） ----------
function makeBoardTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, '#c98f4e');
  grad.addColorStop(0.5, '#d9a45e');
  grad.addColorStop(1, '#c08544');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // 木纹
  g.globalAlpha = 0.07;
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = i % 2 ? '#7a4d1e' : '#f4d29a';
    g.lineWidth = 2 + Math.random() * 5;
    g.beginPath();
    const y0 = Math.random() * S;
    g.moveTo(0, y0);
    for (let x = 0; x <= S; x += 64) g.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 8);
    g.stroke();
  }
  g.globalAlpha = 1;

  const u = S / BOARD;                      // 单位 -> 像素
  const px = c => (MARGIN + c * CELL) * u;
  g.strokeStyle = '#3a2a14';
  g.lineWidth = Math.max(1.5, u * 0.028);
  for (let i = 0; i < N; i++) {
    g.beginPath(); g.moveTo(px(i), px(0)); g.lineTo(px(i), px(N - 1)); g.stroke();
    g.beginPath(); g.moveTo(px(0), px(i)); g.lineTo(px(N - 1), px(i)); g.stroke();
  }
  // 外框加粗
  g.lineWidth *= 1.8;
  g.strokeRect(px(0), px(0), px(N - 1) - px(0), px(N - 1) - px(0));
  // 星位
  g.fillStyle = '#3a2a14';
  for (const [c, r] of [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]) {
    g.beginPath();
    g.arc(px(c), px(r), u * 0.06, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const boardGeo = new THREE.BoxGeometry(BOARD, 0.3, BOARD);
const boardMats = [
  new THREE.MeshStandardMaterial({ color: 0x8a5a26, roughness: 0.9 }),  // +x
  new THREE.MeshStandardMaterial({ color: 0x8a5a26, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ map: makeBoardTexture(), roughness: 0.85 }), // +y 顶面
  new THREE.MeshStandardMaterial({ color: 0x6e451d, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x8a5a26, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0x6e451d, roughness: 0.95 }),
];
const board = new THREE.Mesh(boardGeo, boardMats);
board.position.y = -0.15;
board.receiveShadow = true;
scene.add(board);

// ---------- 棋子 ----------
const stoneGeo = new THREE.SphereGeometry(STONE_R, 48, 32);
stoneGeo.scale(1, STONE_H / STONE_R, 1);
const matBlack = new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.35, metalness: 0.25 });
const matWhite = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.3, metalness: 0.1 });
const matGhost = new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.4, transparent: true, opacity: 0.38, depthWrite: false });

const cellPos = i => (i - (N - 1) / 2) * CELL;
const stones = new Map();   // "c,r" -> mesh
const ghost = new THREE.Mesh(stoneGeo, matGhost);
ghost.visible = false;
ghost.position.y = STONE_H;
scene.add(ghost);

// 胜利高亮环
const ringGeo = new THREE.TorusGeometry(STONE_R * 1.25, 0.045, 12, 48);
ringGeo.rotateX(Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
const rings = [];

// ---------- 游戏状态 ----------
const cell = (c, r) => r * N + c;
let grid, current, moveCount, gameOver, winStones;
let mode = 'human', speed = 420, aiSeq = 0;   // speed: AI 落子间隔 ms；aiSeq: 定时器代次

const aiSide = () => (mode === 'aiverus') ? true : (mode === 'ai' && current === 2);

function scheduleAI() {
  if (gameOver || !aiSide()) return;
  const seq = ++aiSeq;
  updateHUD();
  setTimeout(() => {
    if (seq !== aiSeq || gameOver) return;   // 已有更新的一代定时器/对局 -> 本代作废
    const me = current;
    const [c, r] = aiMove(grid, N, me, 3 - me, mode === 'aiverus' ? 25 : 0);
    placeStone(c, r);
  }, speed);
}

function resetGame() {
  grid = new Uint8Array(N * N);
  current = 1; moveCount = 0; gameOver = false;
  winStones = [];
  for (const m of stones.values()) scene.remove(m);
  stones.clear();
  for (const rg of rings) scene.remove(rg);
  rings.length = 0;
  ghost.visible = false;
  aiSeq++;
  updateHUD();
  scheduleAI();
}

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
function checkWin(c, r) {
  const me = grid[cell(c, r)];
  for (const [dc, dr] of DIRS) {
    const line = [[c, r]];
    for (const s of [1, -1]) {
      let cc = c + dc * s, rr = r + dr * s;
      while (cc >= 0 && cc < N && rr >= 0 && rr < N && grid[cell(cc, rr)] === me) {
        line.push([cc, rr]);
        cc += dc * s; rr += dr * s;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

function placeStone(c, r) {
  if (gameOver || grid[cell(c, r)]) return;
  const mat = current === 1 ? matBlack : matWhite;
  const m = new THREE.Mesh(stoneGeo, mat);
  m.castShadow = true;
  m.position.set(cellPos(c), 4, cellPos(r));
  m.scale.setScalar(0.01);
  scene.add(m);
  m.userData = { dropT0: performance.now(), restY: STONE_H };
  stones.set(`${c},${r}`, m);

  grid[cell(c, r)] = current;
  moveCount++;
  ghost.visible = false;

  const win = checkWin(c, r);
  if (win) {
    gameOver = true;
    winStones = win;
    for (const [wc, wr] of win) {
      const rg = new THREE.Mesh(ringGeo, ringMat);
      rg.position.set(cellPos(wc), 0.02, cellPos(wr));
      scene.add(rg);
      rings.push(rg);
    }
  } else if (moveCount === N * N) {
    gameOver = true;
  } else {
    current = 3 - current;
  }
  scheduleAI();
  updateHUD();
}

// ---------- HUD ----------
const $turnLabel = document.getElementById('turnLabel');
const $stone = document.getElementById('stone');
const $status = document.getElementById('status');
const $moves = document.getElementById('moves');

function updateHUD() {
  const name = current === 1 ? '黑棋' : '白棋';
  $stone.classList.toggle('white', current === 2);
  if (gameOver) {
    const winner = winStones.length ? (grid[cell(winStones[0][0], winStones[0][1])] === 1 ? '黑棋' : '白棋') : null;
    $turnLabel.textContent = winner ? '对局结束' : '平局';
    $status.textContent = winner ? (mode === 'aiverus' ? `AI 对局结束：${winner} 五连获胜！` : `${winner} 五连获胜！`) : '棋盘已满，平局。';
    $status.classList.toggle('win', !!winner);
  } else if (mode === 'aiverus') {
    $turnLabel.textContent = `AI 对 AI · ${name}落子…`;
    $status.textContent = '';
    $status.classList.remove('win');
  } else if (mode === 'ai' && current === 2) {
    $turnLabel.textContent = 'AI 思考中…';
    $status.textContent = '';
    $status.classList.remove('win');
  } else {
    $turnLabel.textContent = `${name}行棋`;
    $status.textContent = '';
    $status.classList.remove('win');
  }
  $moves.textContent = `手数 ${moveCount} / ${N * N}`;
}

document.getElementById('resetBtn').addEventListener('click', resetGame);
const $speedRow = document.getElementById('speedRow');
document.getElementById('modeSel').addEventListener('change', e => {
  mode = e.target.value;
  $speedRow.style.display = mode === 'aiverus' ? '' : 'none';
  resetGame();
});
document.getElementById('speedSel').addEventListener('change', e => {
  speed = Number(e.target.value);
});
// 初始：speedRow 仅 aiverus 显示（默认 human -> 隐藏）
$speedRow.style.display = 'none';

// ---------- 拾取（射线 -> 最近交叉点） ----------
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

function cellFromEvent(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  const c = Math.round(hit.x / CELL + (N - 1) / 2);
  const r = Math.round(hit.z / CELL + (N - 1) / 2);
  if (c < 0 || c >= N || r < 0 || r >= N) return null;
  return [c, r];
}

let downX = 0, downY = 0, downT = 0;
renderer.domElement.addEventListener('pointerdown', e => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
});
renderer.domElement.addEventListener('pointermove', e => {
  if (gameOver || aiSide()) { ghost.visible = false; return; }
  const cr = cellFromEvent(e);
  if (cr && !stones.has(`${cr[0]},${cr[1]}`)) {
    ghost.visible = true;
    ghost.position.set(cellPos(cr[0]), STONE_H, cellPos(cr[1]));
    matGhost.color.set(current === 1 ? 0x11141a : 0xf5f2ea);
    document.body.style.cursor = 'pointer';
  } else {
    ghost.visible = false;
    document.body.style.cursor = '';
  }
});
renderer.domElement.addEventListener('click', e => {
  const dragged = Math.hypot(e.clientX - downX, e.clientY - downY) > 6 || performance.now() - downT > 400;
  if (dragged || aiSide()) return;   // 相机拖拽不算落子；AI 回合（含 aiverus）禁止落子
  const cr = cellFromEvent(e);
  if (cr) placeStone(cr[0], cr[1]);
});

// ---------- 渲染循环 ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  const now = performance.now();
  for (const m of stones.values()) {
    const u = m.userData;
    const t = Math.min((now - u.dropT0) / 260, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    m.position.y = THREE.MathUtils.lerp(4, u.restY, ease);
    const pop = t < 1 ? 0.01 + 0.99 * ease : 1;
    m.scale.setScalar(pop);
  }
  if (rings.length) {
    const s = 1 + 0.18 * Math.sin(now * 0.006);
    for (const rg of rings) rg.scale.setScalar(s);
    ringMat.color.setHSL(0.12, 0.9, 0.6 + 0.15 * Math.sin(now * 0.006));
  }
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

resetGame();
animate();

// ---------- PWA：注册 service worker（离线可玩 / 可安装为应用） ----------
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW 注册失败：', err));
  });
}
