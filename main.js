import * as THREE from 'three';
import nipplejs from 'nipplejs';

// =====================================================================
// Cheese School — Baldi's Basics Plus style upgrade
// =====================================================================

// --- Game State ---
let isGameOver = false;
let score = 0;
let totalNotebooks = 0;
let gameStarted = false;
let isMathActive = false;
let coins = 0;

let escapeMode = false;            // all notebooks collected -> find an exit
let catnipActiveUntil = 0;
let catnipTarget = null;
let pendingNotebook = null;
let currentProblem = null;
let pendingImpossible = false;

// Inventory: 3 slots, each null or an item-type string ('catnip' | 'soda' | 'energy')
const INVENTORY_SIZE = 3;
const inventory = [null, null, null];

// Stamina / sprint
let stamina = 1;
let sprinting = false;
let exhausted = false;
let sprintHeld = false;
let sprintBoostUntil = 0;          // energy bar effect

// Cheese disruption
let cheeseStunnedUntil = 0;
let cheeseSlowUntil = 0;
let cheeseBonusSpeed = 0; // permanent extra speed from wrong/impossible answers

// --- Tuning ---
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.4;
const PLAYER_SPEED = 5.2;
const SPRINT_MULT = 1.75;
const STAMINA_DRAIN = 0.55;        // per second while sprinting
const STAMINA_REGEN = 0.32;        // per second while not sprinting
const STAMINA_RESPRINT = 0.3;      // must recover to this after exhaustion

const CHEESE_START_SPEED = 1.6;
const CHEESE_MAX_SPEED = 8.0;
const CHEESE_SPEED_PER_NOTEBOOK = 0.55;   // the core BB mechanic
const CHEESE_WRONG_ANSWER_SPEED_BOOST = 0.45;
const CHEESE_IMPOSSIBLE_BOOST = 1.4;
const CHEESE_ESCAPE_BOOST = 1.6;
const CHEESE_CATCH_RADIUS = 1.25;
const CHEESE_GRACE_SECONDS = 3.0;

const NOTEBOOK_PICKUP_RADIUS = 1.5;
const NOTEBOOK_PICKUP_COOLDOWN_SECONDS = 0.75;
const ITEM_PICKUP_RADIUS = 1.4;
const EXIT_RADIUS = 1.6;

const ITEM_INFO = {
  catnip: {
    label: 'CATNIP',
    color: 0x9bdeac,
    short: 'CAT',
    sprite: '/item_catnip.png'
  },
  soda: {
    label: 'CHEESE-SODA',
    color: 0x6ab0ff,
    short: 'POP',
    sprite: '/item_cheese_soda.png'
  },
  energy: {
    label: 'ZESTY BAR',
    color: 0xffc04d,
    short: 'NRG',
    sprite: '/item_zesty_bar.png'
  }
};

const nowSec = () => performance.now() / 1000;

// --- Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5e9d0);
scene.fog = new THREE.Fog(0xf5e9d0, 5, 30);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio || 1);
document.body.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd0c0a0, 0.85);
scene.add(hemiLight);

// --- HUD elements ---
const hudEl = document.getElementById('hud');
const hudMessageEl = document.getElementById('hud-message');
const coinCountEl = document.getElementById('coin-count');
const objectiveEl = document.getElementById('objective');
const staminaFillEl = document.getElementById('stamina-fill');
const interactPromptEl = document.getElementById('interact-prompt');
const interactButtonEl = document.getElementById('interact-button');
const runButton = document.getElementById('run-button');
const inventoryBar = document.getElementById('inventory-bar');
let hudTimeoutId = null;

if (interactButtonEl) interactButtonEl.addEventListener('click', tryInteract);

// Build inventory slot DOM
const slotEls = [];
if (inventoryBar) {
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.dataset.index = i;
    slot.addEventListener('click', () => useItem(i));
    inventoryBar.appendChild(slot);
    slotEls.push(slot);
  }
}

function renderHud() {
  if (coinCountEl) coinCountEl.textContent = coins.toString();
  const scoreSpan = document.getElementById('score');
  const totalSpan = document.getElementById('total-notebooks');
  if (scoreSpan) scoreSpan.textContent = score.toString();
  if (totalSpan) totalSpan.textContent = totalNotebooks.toString();
  if (objectiveEl) {
    objectiveEl.textContent = escapeMode
      ? 'ESCAPE! Reach a glowing GREEN exit!'
      : 'Collect every notebook.';
  }
  renderInventory();
}

function renderInventory() {
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const el = slotEls[i];
    if (!el) continue;
    const item = inventory[i];

    if (item) {
      const info = ITEM_INFO[item];
      el.classList.add('filled');
      el.textContent = '';
      el.style.borderColor = '#' + info.color.toString(16).padStart(6, '0');
      el.style.backgroundImage = `url('${info.sprite}')`;
      el.style.backgroundSize = 'contain';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundPosition = 'center';
    } else {
      el.classList.remove('filled');
      el.textContent = (i + 1).toString();
      el.style.borderColor = 'rgba(255,255,255,0.35)';
      el.style.backgroundImage = 'none';
    }
  }
}

function updateStaminaBar() {
  if (!staminaFillEl) return;
  staminaFillEl.style.width = Math.round(stamina * 100) + '%';
  staminaFillEl.style.background = exhausted ? '#e74c3c' : (sprinting ? '#f1c40f' : '#2ecc71');
}

function showTemporaryHud(message, duration = 1400) {
  clearTimeout(hudTimeoutId);
  if (hudMessageEl) hudMessageEl.textContent = message;
  hudEl.style.background = 'rgba(0, 0, 0, 0.6)';
  hudTimeoutId = setTimeout(() => {
    if (hudMessageEl) hudMessageEl.textContent = '';
    hudEl.style.background = 'rgba(0, 0, 0, 0.3)';
  }, duration);
}

function flashScreen(color = 'rgba(255, 0, 0, 0.4)', duration = 100) {
  const flash = document.getElementById('screen-flash');
  flash.style.background = color;
  setTimeout(() => { flash.style.background = 'rgba(255, 0, 0, 0)'; }, duration);
}

function setDangerLevel(level) {
  const danger = document.getElementById('danger-overlay');
  if (!danger) return;
  danger.style.opacity = Math.max(0, Math.min(1, level)).toString();
}

// --- Map Generation ---
const tileSize = 4;
const GRID_ROWS = 17;
const GRID_COLS = 29;
const HALLWAY_TOP = 7;
const HALLWAY_BOTTOM = 9;
const HALLWAY_MID = 8;

function createGrid(rows, cols, fill = 1) {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}
function carveRect(grid, x, z, w, h, val) {
  for (let r = z; r < z + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) grid[r][c] = val;
    }
  }
}

const mapGrid = createGrid(GRID_ROWS, GRID_COLS, 1);
carveRect(mapGrid, 1, HALLWAY_TOP, GRID_COLS - 2, 3, 0);

const classrooms = [
  { x: 2, z: 2, w: 5, h: 5 }, { x: 9, z: 2, w: 5, h: 5 },
  { x: 16, z: 2, w: 5, h: 5 }, { x: 23, z: 2, w: 4, h: 5 },
  { x: 2, z: 10, w: 5, h: 5 }, { x: 9, z: 10, w: 5, h: 5 },
  { x: 16, z: 10, w: 5, h: 5 }, { x: 23, z: 10, w: 4, h: 5 },
];

// scattered item pickups live here (room corners)
const itemSpawnCells = [];

classrooms.forEach((room, i) => {
  carveRect(mapGrid, room.x, room.z, room.w, room.h, 3);
  const doorX = room.x + Math.floor(room.w / 2);
  if (room.z < HALLWAY_TOP) mapGrid[HALLWAY_TOP - 1][doorX] = 0;
  else mapGrid[HALLWAY_BOTTOM + 1][doorX] = 0;

  const nbX = room.x + Math.floor(room.w / 2);
  const nbZ = room.z + Math.floor(room.h / 2);
  mapGrid[nbZ][nbX] = 2;

  // put an item in a corner of every other room
  if (i % 2 === 0) {
    const cx = room.x + 1;
    const cz = room.z + 1;
    if (mapGrid[cz][cx] === 3) {
      const types = ['soda', 'energy', 'catnip'];
      itemSpawnCells.push({ col: cx, row: cz, type: types[(i / 2) % types.length] });
    }
  }
});

const gridCols = mapGrid[0].length;
const gridRows = mapGrid.length;
const offsetX = -(gridCols * tileSize) / 2;
const offsetZ = -(gridRows * tileSize) / 2;
const wallHeight = 3.5;

const cellCenter = (col, row) => new THREE.Vector3(
  offsetX + col * tileSize + tileSize / 2,
  0,
  offsetZ + row * tileSize + tileSize / 2
);

// --- Environment ---
const loader = new THREE.TextureLoader();

const wallGeo = new THREE.BoxGeometry(tileSize, wallHeight, tileSize);
const wallMat = new THREE.MeshStandardMaterial({ color: 0xc5cbd4, roughness: 0.7 });
const hallwayFloorMat = new THREE.MeshStandardMaterial({ color: 0xe7d5a3, roughness: 0.9 });
const classroomFloorMat = new THREE.MeshStandardMaterial({ color: 0x6fa8dc, roughness: 0.8 });

const notebooks = [];
const notebookGeo = new THREE.PlaneGeometry(1, 1);
const notebookTexture = loader.load('/notebook.png');
notebookTexture.colorSpace = THREE.SRGBColorSpace;
const notebookImpossibleTexture = loader.load('/notebook_impossible.png');
notebookImpossibleTexture.colorSpace = THREE.SRGBColorSpace;
const notebookMat = new THREE.MeshBasicMaterial({
  map: notebookTexture, transparent: true, side: THREE.DoubleSide
});
const notebookImpossibleMat = new THREE.MeshBasicMaterial({
  map: notebookImpossibleTexture, transparent: true, side: THREE.DoubleSide
});

for (let row = 0; row < gridRows; row++) {
  for (let col = 0; col < gridCols; col++) {
    const xPos = offsetX + col * tileSize + tileSize / 2;
    const zPos = offsetZ + row * tileSize + tileSize / 2;
    const cell = mapGrid[row][col];
    if (cell === 1) {
      const mesh = new THREE.Mesh(wallGeo, wallMat);
      mesh.position.set(xPos, wallHeight / 2, zPos);
      scene.add(mesh);
    } else {
      const isClassroomFloor = cell === 3 || cell === 2;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(tileSize, tileSize),
        isClassroomFloor ? classroomFloorMat : hallwayFloorMat
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(xPos, 0, zPos);
      scene.add(floor);

      if (cell === 2) {
        const notebook = new THREE.Mesh(notebookGeo, notebookMat.clone());
        notebook.position.set(xPos, 1, zPos);
        notebook.userData = { initialY: 1, floatSpeed: Math.random() * 2 + 1, isImpossible: false };
        scene.add(notebook);
        notebooks.push(notebook);
        totalNotebooks++;
      }
    }
  }
}

// --- Item pickups ---
const itemPickups = [];
const itemTextures = {};
function loadItemTexture(type) {
  const tex = loader.load(ITEM_INFO[type].sprite);
  tex.colorSpace = THREE.SRGBColorSpace;
  itemTextures[type] = tex;
}
['catnip', 'soda', 'energy'].forEach(loadItemTexture);

itemSpawnCells.forEach(spec => {
  const tex = itemTextures[spec.type];
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
  const c = cellCenter(spec.col, spec.row);
  mesh.position.set(c.x, 1.0, c.z);
  mesh.userData = { type: spec.type, baseY: 1.0 };
  scene.add(mesh);
  itemPickups.push(mesh);
});

// --- Exits (used in escape mode) ---
const exitLockedTexture = loader.load('/exit_locked.png');
exitLockedTexture.colorSpace = THREE.SRGBColorSpace;
const exitOpenTexture = loader.load('/exit_open.png');
exitOpenTexture.colorSpace = THREE.SRGBColorSpace;
const exitLockedMat = new THREE.MeshBasicMaterial({ map: exitLockedTexture, transparent: true, side: THREE.DoubleSide });
const exitOpenMat = new THREE.MeshBasicMaterial({ map: exitOpenTexture, transparent: true, side: THREE.DoubleSide });
const exits = [];
function makeExit(col) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), exitLockedMat.clone());
  const c = cellCenter(col, HALLWAY_MID);
  mesh.position.set(c.x, 2.0, c.z);
  scene.add(mesh);
  exits.push(mesh);
}
makeExit(1);
makeExit(gridCols - 2);

renderHud();
updateStaminaBar();

// --- Player Spawn ---
const playerSpawn = new THREE.Vector3(
  offsetX + 2 * tileSize, PLAYER_HEIGHT,
  offsetZ + (HALLWAY_TOP + 1.5) * tileSize
);
camera.position.copy(playerSpawn);

// --- Cheese Entity ---
const cheeseGroup = new THREE.Group();
scene.add(cheeseGroup);
const cheeseTexture = loader.load('/cat_background_removed.png');
cheeseTexture.colorSpace = THREE.SRGBColorSpace;
const cheesePlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1.2, 1.4),
  new THREE.MeshBasicMaterial({ map: cheeseTexture, transparent: true })
);
cheesePlane.position.y = 1.2;
cheeseGroup.add(cheesePlane);

const cheeseSpawn = new THREE.Vector3(
  offsetX + (gridCols - 2) * tileSize, 0,
  offsetZ + (HALLWAY_TOP + 1) * tileSize
);
cheeseGroup.position.copy(cheeseSpawn);

// --- Vending Machine ---
let vendingBlocker = null;
const vendingTexture = loader.load('/vending_machine.png');
vendingTexture.colorSpace = THREE.SRGBColorSpace;
const vendingMachine = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 3),
  new THREE.MeshBasicMaterial({ map: vendingTexture, transparent: true, side: THREE.DoubleSide })
);
vendingMachine.position.set(
  offsetX + 4 * tileSize, 1.5,
  offsetZ + (HALLWAY_TOP + 1.2) * tileSize
);
vendingMachine.rotation.y = Math.PI / 2;
scene.add(vendingMachine);
// Rectangle used by isSolid() so the player cannot walk through the machine.
vendingBlocker = {
  x: vendingMachine.position.x,
  z: vendingMachine.position.z,
  halfX: 0.45,
  halfZ: 1.25
};
const VENDING_INTERACT_RADIUS = 2.5;
const VENDING_ITEMS = ['catnip', 'soda', 'energy'];
let vendingStock = VENDING_ITEMS[0];
function rerollVending() {
  vendingStock = VENDING_ITEMS[Math.floor(Math.random() * VENDING_ITEMS.length)];
}
rerollVending();

// --- Controls ---
let yaw = 0;
let pitch = 0;
const moveState = { forward: false, backward: false, left: false, right: false };
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let joystickVector = { x: 0, y: 0 };

if (!isTouchDevice) {
  document.body.addEventListener('click', () => {
    if (gameStarted && !isGameOver && !isMathActive) document.body.requestPointerLock?.();
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === document.body) {
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
    }
  });
  window.addEventListener('keydown', e => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': moveState.forward = true; break;
      case 'KeyS': case 'ArrowDown': moveState.backward = true; break;
      case 'KeyA': case 'ArrowLeft': moveState.left = true; break;
      case 'KeyD': case 'ArrowRight': moveState.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': sprintHeld = true; break;
      case 'KeyE': tryInteract(); break;
      case 'Digit1': useItem(0); break;
      case 'Digit2': useItem(1); break;
      case 'Digit3': useItem(2); break;
    }
  });
  window.addEventListener('keyup', e => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': moveState.forward = false; break;
      case 'KeyS': case 'ArrowDown': moveState.backward = false; break;
      case 'KeyA': case 'ArrowLeft': moveState.left = false; break;
      case 'KeyD': case 'ArrowRight': moveState.right = false; break;
      case 'ShiftLeft': case 'ShiftRight': sprintHeld = false; break;
    }
  });
} else {
  const joystick = nipplejs.create({
    zone: document.getElementById('joystick-zone'),
    mode: 'static', position: { left: '70px', bottom: '90px' },
    color: 'rgba(255,255,255,0.6)', size: 120
  });
  joystick.on('move', (evt, data) => {
    const force = Math.min(data.force, 1);
    const angle = data.angle.radian;
    joystickVector.x = Math.cos(angle) * force;
    joystickVector.y = Math.sin(angle) * force;
  });
  joystick.on('end', () => { joystickVector.x = 0; joystickVector.y = 0; });

  if (runButton) {
    const setRun = v => () => { sprintHeld = v; };
    runButton.addEventListener('touchstart', setRun(true), { passive: true });
    runButton.addEventListener('touchend', setRun(false), { passive: true });
    runButton.addEventListener('touchcancel', setRun(false), { passive: true });
  }

  let activeLookTouchId = null, lastLookX = 0, lastLookY = 0;
  renderer.domElement.addEventListener('touchstart', e => {
    for (const touch of e.changedTouches) {
      if (touch.clientX >= window.innerWidth / 2 && activeLookTouchId === null) {
        activeLookTouchId = touch.identifier; lastLookX = touch.clientX; lastLookY = touch.clientY;
      }
    }
  }, { passive: false });
  renderer.domElement.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (touch.identifier === activeLookTouchId) {
        yaw -= (touch.clientX - lastLookX) * 0.003;
        pitch -= (touch.clientY - lastLookY) * 0.003;
        pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
        lastLookX = touch.clientX; lastLookY = touch.clientY;
      }
    }
  }, { passive: false });
  renderer.domElement.addEventListener('touchend', e => {
    for (const touch of e.changedTouches)
      if (touch.identifier === activeLookTouchId) activeLookTouchId = null;
  }, { passive: false });
  renderer.domElement.addEventListener('touchcancel', () => { activeLookTouchId = null; }, { passive: false });
}

// --- Collision / Grid Helpers ---
function worldToCell(x, z) {
  return {
    col: Math.floor((x - offsetX) / tileSize),
    row: Math.floor((z - offsetZ) / tileSize)
  };
}

function isWalkableCell(col, row) {
  return row >= 0 && row < gridRows && col >= 0 && col < gridCols && mapGrid[row][col] !== 1;
}

function isWall(x, z) {
  const buffer = PLAYER_RADIUS;
  const corners = [
    { cx: x - buffer, cz: z - buffer }, { cx: x + buffer, cz: z - buffer },
    { cx: x - buffer, cz: z + buffer }, { cx: x + buffer, cz: z + buffer }
  ];
  for (const c of corners) {
    const { col, row } = worldToCell(c.cx, c.cz);
    if (!isWalkableCell(col, row)) return true;
  }
  return false;
}

function isBlockedByVending(x, z, radius = PLAYER_RADIUS) {
  if (!vendingBlocker) return false;
  const insideX = Math.abs(x - vendingBlocker.x) < vendingBlocker.halfX + radius;
  const insideZ = Math.abs(z - vendingBlocker.z) < vendingBlocker.halfZ + radius;
  return insideX && insideZ;
}

function isSolid(x, z) {
  return isWall(x, z) || isBlockedByVending(x, z);
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function hasLineOfSight(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / (tileSize * 0.35)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    if (isWall(x, z)) return false;
  }
  return true;
}

// --- Cheese AI / Audio ---
let cheeseSpeed = CHEESE_START_SPEED;
let cheeseActiveAt = Infinity;
let lastCheeseSpeakTime = 0;
let cheeseAudioUrl = null;
let canUseSpeechSynthesis = false;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { audioCtx = null; }
  }
  return audioCtx;
}

async function prepareCheeseSound() {
  try {
    if (typeof websim !== 'undefined' && websim.textToSpeech) {
      const result = await websim.textToSpeech({ text: 'cheese' });
      cheeseAudioUrl = result.url;
      return;
    }
  } catch (err) {
    console.warn('WebSim TTS failed. Falling back to browser speech.', err);
  }
  canUseSpeechSynthesis = 'speechSynthesis' in window;
}

// Recompute Cheese speed from notebooks plus explicit penalties.
// Wrong/impossible answers add to cheeseBonusSpeed once; recomputeCheeseSpeed()
// should never silently double-apply a bonus.
function recomputeCheeseSpeed() {
  let s = CHEESE_START_SPEED + score * CHEESE_SPEED_PER_NOTEBOOK + cheeseBonusSpeed;
  if (escapeMode) s += CHEESE_ESCAPE_BOOST;
  cheeseSpeed = Math.min(s, CHEESE_MAX_SPEED);
}

function addCheeseSpeedBonus(amount) {
  cheeseBonusSpeed = Math.min(cheeseBonusSpeed + amount, CHEESE_MAX_SPEED);
  recomputeCheeseSpeed();
}

// Pan + volume by direction/distance to the player
function playCheeseSound() {
  const dx = cheeseGroup.position.x - camera.position.x;
  const dz = cheeseGroup.position.z - camera.position.z;
  const dist = Math.hypot(dx, dz);
  const volume = Math.max(0.05, Math.min(1, 1 - dist / 14));
  // right vector for current yaw
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const len = dist || 1;
  let pan = (dx / len) * rx + (dz / len) * rz;
  pan = Math.max(-1, Math.min(1, pan));

  if (cheeseAudioUrl) {
    const audio = new Audio(cheeseAudioUrl);
    audio.volume = volume;
    const ctx = getAudioCtx();
    if (ctx && ctx.createStereoPanner) {
      try {
        if (ctx.state === 'suspended') ctx.resume();
        const src = ctx.createMediaElementSource(audio);
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        src.connect(panner).connect(ctx.destination);
      } catch { /* fall back to plain volume */ }
    }
    audio.play().catch(() => {});
    return;
  }
  if (canUseSpeechSynthesis) {
    const u = new SpeechSynthesisUtterance('cheese');
    u.rate = 0.9; u.pitch = 0.75; u.volume = volume;
    speechSynthesis.speak(u);
  }
}


// --- Cheese Pathfinding ---
let cheesePath = [];
let cheeseNextPathRefreshAt = 0;
let cheeseLastTargetKey = '';
const CHEESE_PATH_REFRESH_SECONDS = 0.35;

function cellKey(cell) {
  return `${cell.col},${cell.row}`;
}

function findPath(startCell, targetCell) {
  if (!isWalkableCell(startCell.col, startCell.row) || !isWalkableCell(targetCell.col, targetCell.row)) {
    return [];
  }

  const startKey = cellKey(startCell);
  const targetKey = cellKey(targetCell);
  if (startKey === targetKey) return [];

  const queue = [startCell];
  const cameFrom = new Map();
  cameFrom.set(startKey, null);

  const dirs = [
    { col: 1, row: 0 },
    { col: -1, row: 0 },
    { col: 0, row: 1 },
    { col: 0, row: -1 }
  ];

  for (let qi = 0; qi < queue.length; qi++) {
    const current = queue[qi];
    const currentKey = cellKey(current);
    if (currentKey === targetKey) break;

    for (const d of dirs) {
      const next = { col: current.col + d.col, row: current.row + d.row };
      const nextKey = cellKey(next);
      if (cameFrom.has(nextKey)) continue;
      if (!isWalkableCell(next.col, next.row)) continue;
      cameFrom.set(nextKey, current);
      queue.push(next);
    }
  }

  if (!cameFrom.has(targetKey)) return [];

  const path = [];
  let current = targetCell;
  while (current && cellKey(current) !== startKey) {
    path.push(current);
    current = cameFrom.get(cellKey(current));
  }
  path.reverse();
  return path;
}

function getCheeseMoveTarget(target, time) {
  if (hasLineOfSight(cheeseGroup.position, target)) {
    cheesePath = [];
    return target;
  }

  const startCell = worldToCell(cheeseGroup.position.x, cheeseGroup.position.z);
  const targetCell = worldToCell(target.x, target.z);
  const targetKey = cellKey(targetCell);

  if (time >= cheeseNextPathRefreshAt || targetKey !== cheeseLastTargetKey || cheesePath.length === 0) {
    cheesePath = findPath(startCell, targetCell);
    cheeseNextPathRefreshAt = time + CHEESE_PATH_REFRESH_SECONDS;
    cheeseLastTargetKey = targetKey;
  }

  while (cheesePath.length > 0) {
    const nextCenter = cellCenter(cheesePath[0].col, cheesePath[0].row);
    if (horizontalDistance(cheeseGroup.position, nextCenter) < 0.35) cheesePath.shift();
    else return nextCenter;
  }

  return target;
}

// --- Math ---
function generateMathProblem() {
  const solved = score;
  let ops;
  if (solved < 2) ops = ['+'];
  else if (solved < 4) ops = ['+', '-'];
  else ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;
  switch (op) {
    case '+': a = rnd(1, 10); b = rnd(1, 10); answer = a + b; break;
    case '-': a = rnd(5, 19); b = Math.floor(Math.random() * Math.min(a, 10)); answer = a - b; break;
    case '*': a = rnd(2, 9); b = rnd(2, 9); answer = a * b; break;
  }
  return { text: `${a} ${op === '*' ? '×' : op} ${b} = ?`, answer };
}
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function showMathModal(notebook) {
  isMathActive = true;
  pendingNotebook = notebook;
  // The 3rd notebook is the classic "impossible" one
  pendingImpossible = (score === 2);
  if (pendingImpossible && !notebook.userData.isImpossible) {
    notebook.material.map = notebookImpossibleTexture;
    notebook.userData.isImpossible = true;
  }
  const modal = document.getElementById('math-modal');
  const questionEl = document.getElementById('math-question');
  const answerEl = document.getElementById('math-answer');

  if (pendingImpossible) {
    currentProblem = { text: '◹⟁⌧ + ⍝⏧ × ⟆◇⍫ = ⊠', answer: NaN };
    questionEl.innerText = currentProblem.text;
    answerEl.value = '';
    answerEl.placeholder = '???';
    questionEl.classList.add('glitch-text');
  } else {
    currentProblem = generateMathProblem();
    questionEl.innerText = currentProblem.text;
    answerEl.value = '';
    answerEl.placeholder = '';
    questionEl.classList.remove('glitch-text');
  }
  modal.style.display = 'flex';
  setTimeout(() => answerEl.focus(), 0);
  if (document.pointerLockElement === document.body) document.exitPointerLock();
}

function hideMathModal() {
  isMathActive = false;
  pendingNotebook = null;
  currentProblem = null;
  pendingImpossible = false;
  document.getElementById('math-question').classList.remove('glitch-text');
  document.getElementById('math-modal').style.display = 'none';
}

let notebookPickupCooldownUntil = 0;

function collectNotebook() {
  scene.remove(pendingNotebook);
  const index = notebooks.indexOf(pendingNotebook);
  if (index !== -1) notebooks.splice(index, 1);
  score++;
  coins += 1;
  recomputeCheeseSpeed();
  renderHud();
  if (score >= totalNotebooks) {
    enterEscapeMode();
  }
}

function enterEscapeMode() {
  escapeMode = true;
  recomputeCheeseSpeed();
  exits.forEach(ex => {
    ex.material = exitOpenMat.clone();
    ex.material.needsUpdate = true;
  });
  renderHud();
  showTemporaryHud('ALL NOTEBOOKS! RUN TO A GREEN EXIT!', 2600);
  flashScreen('rgba(46, 204, 113, 0.35)', 200);
}

function submitAnswer() {
  if (!currentProblem || !pendingNotebook) return;
  const input = document.getElementById('math-answer');

  if (pendingImpossible) {
    // You always get the notebook, but Cheese is furious.
    collectNotebook();
    addCheeseSpeedBonus(CHEESE_IMPOSSIBLE_BOOST);
    flashScreen('rgba(255, 0, 0, 0.55)', 220);
    showTemporaryHud('THE PROBLEM WAS IMPOSSIBLE! CHEESE IS FURIOUS!', 2200);
    notebookPickupCooldownUntil = nowSec() + NOTEBOOK_PICKUP_COOLDOWN_SECONDS;
    hideMathModal();
    return;
  }

  const guess = parseInt(input.value, 10);
  if (Number.isNaN(guess)) { showTemporaryHud('TYPE AN ANSWER!'); return; }

  if (guess === currentProblem.answer) {
    collectNotebook();
    showTemporaryHud('NOTEBOOK + 1 COIN!');
  } else {
    addCheeseSpeedBonus(CHEESE_WRONG_ANSWER_SPEED_BOOST);
    flashScreen();
    showTemporaryHud('WRONG! CHEESE IS FASTER!');
  }
  notebookPickupCooldownUntil = nowSec() + NOTEBOOK_PICKUP_COOLDOWN_SECONDS;
  hideMathModal();
}

document.getElementById('math-submit').addEventListener('click', submitAnswer);
document.getElementById('math-answer').addEventListener('keydown', e => {
  if (e.code === 'Enter') submitAnswer();
});

// --- Items ---
function addItem(type) {
  const slot = inventory.indexOf(null);
  if (slot === -1) return false;
  inventory[slot] = type;
  renderInventory();
  return true;
}

function useItem(index) {
  if (isMathActive || isGameOver || !gameStarted) return;
  const type = inventory[index];
  if (!type) return;
  const time = nowSec();
  switch (type) {
    case 'catnip':
      catnipActiveUntil = time + 5;
      catnipTarget = camera.position.clone();
      showTemporaryHud('CATNIP! CHEESE IS DISTRACTED!');
      break;
    case 'soda':
      applySodaPush();
      cheeseSlowUntil = time + 2.5;
      cheeseStunnedUntil = time + 0.6;
      showTemporaryHud('CHEESE-SODA! KNOCKED CHEESE BACK!');
      break;
    case 'energy':
      stamina = 1; exhausted = false;
      sprintBoostUntil = time + 6;
      showTemporaryHud('ZESTY BAR! UNLIMITED RUNNING!');
      break;
  }
  inventory[index] = null;
  renderInventory();
}

function applySodaPush() {
  const dir = new THREE.Vector3().subVectors(cheeseGroup.position, camera.position);
  dir.y = 0;
  if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
  dir.normalize();
  const step = 0.5, max = 11;
  let moved = 0;
  while (moved < max) {
    const nx = cheeseGroup.position.x + dir.x * step;
    const nz = cheeseGroup.position.z + dir.z * step;
    if (isSolid(nx, cheeseGroup.position.z) || isSolid(cheeseGroup.position.x, nz)) break;
    cheeseGroup.position.x = nx;
    cheeseGroup.position.z = nz;
    moved += step;
  }
}

// --- Game Flow ---
function startGame() {
  isGameOver = false;
  gameStarted = true;
  isMathActive = false;
  score = 0;
  coins = 0;
  escapeMode = false;
  cheeseBonusSpeed = 0;
  cheesePath = [];
  cheeseNextPathRefreshAt = 0;
  cheeseLastTargetKey = '';
  catnipActiveUntil = 0;
  catnipTarget = null;
  stamina = 1; exhausted = false; sprintHeld = false; sprintBoostUntil = 0;
  inventory.fill(null);
  renderHud();
  updateStaminaBar();
  yaw = 0; pitch = 0;
  camera.position.copy(playerSpawn);
  cheeseGroup.position.copy(cheeseSpawn);
  recomputeCheeseSpeed();
  cheeseActiveAt = nowSec() + CHEESE_GRACE_SECONDS;
  lastCheeseSpeakTime = 0;
  document.getElementById('start-screen').style.display = 'none';
  getAudioCtx();
  prepareCheeseSound();
  if (!isTouchDevice) document.body.requestPointerLock?.();
}

function gameOver() {
  if (isGameOver) return;
  isGameOver = true;
  setDangerLevel(0);
  document.getElementById('game-over').style.display = 'flex';
  if (document.pointerLockElement === document.body) document.exitPointerLock();
}

function winGame() {
  if (isGameOver) return;
  isGameOver = true;
  setDangerLevel(0);
  document.getElementById('win-screen').style.display = 'flex';
  if (document.pointerLockElement === document.body) document.exitPointerLock();
}

document.getElementById('start-btn').addEventListener('click', startGame);

// --- Update Loops ---
function isMoving() {
  if (isTouchDevice) return Math.hypot(joystickVector.x, joystickVector.y) > 0.15;
  return moveState.forward || moveState.backward || moveState.left || moveState.right;
}

function updateStamina(dt) {
  const time = nowSec();
  const boosted = time < sprintBoostUntil;
  const wantsSprint = sprintHeld && isMoving();

  if (boosted && wantsSprint) {
    sprinting = true;
    stamina = Math.min(1, stamina + STAMINA_REGEN * dt);
  } else if (wantsSprint && !exhausted && stamina > 0) {
    sprinting = true;
    stamina = Math.max(0, stamina - STAMINA_DRAIN * dt);
    if (stamina <= 0) { exhausted = true; sprinting = false; }
  } else {
    sprinting = false;
    stamina = Math.min(1, stamina + STAMINA_REGEN * dt);
    if (exhausted && stamina >= STAMINA_RESPRINT) exhausted = false;
  }
  updateStaminaBar();
}

function updatePlayer(dt) {
  if (isMathActive || isGameOver) return;
  const time = nowSec();
  const boosted = time < sprintBoostUntil;
  const speedMult = sprinting ? (boosted ? SPRINT_MULT * 1.1 : SPRINT_MULT) : 1;
  const speed = PLAYER_SPEED * speedMult * dt;

  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
  let dx = 0, dz = 0;

  if (!isTouchDevice) {
    if (moveState.forward) { dx += forward.x * speed; dz += forward.z * speed; }
    if (moveState.backward) { dx -= forward.x * speed; dz -= forward.z * speed; }
    if (moveState.right) { dx += right.x * speed; dz += right.z * speed; }
    if (moveState.left) { dx -= right.x * speed; dz -= right.z * speed; }
  } else {
    const joyX = joystickVector.x, joyY = joystickVector.y;
    dx += (forward.x * joyY + right.x * joyX) * speed;
    dz += (forward.z * joyY + right.z * joyX) * speed;
  }

  const nextX = camera.position.x + dx;
  const nextZ = camera.position.z + dz;
  if (!isSolid(nextX, camera.position.z)) camera.position.x = nextX;
  if (!isSolid(camera.position.x, nextZ)) camera.position.z = nextZ;

  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function updateCheese(dt, time) {
  if (isGameOver || isMathActive) { setDangerLevel(0); return; }
  cheeseGroup.lookAt(camera.position.x, cheeseGroup.position.y, camera.position.z);

  if (time < cheeseActiveAt) { setDangerLevel(0); return; }
  if (time < cheeseStunnedUntil) { setDangerLevel(0.4); return; }

  const distToPlayer = horizontalDistance(cheeseGroup.position, camera.position);
  setDangerLevel(Math.max(0, 1 - distToPlayer / 10));

  const distracted = time < catnipActiveUntil && catnipTarget;
  const target = distracted ? catnipTarget : camera.position;
  const distToTarget = horizontalDistance(cheeseGroup.position, target);

  if (distToTarget > CHEESE_CATCH_RADIUS) {
    const moveTarget = getCheeseMoveTarget(target, time);
    const direction = new THREE.Vector3().subVectors(moveTarget, cheeseGroup.position);
    direction.y = 0;
    const targetDistance = direction.length();
    if (targetDistance > 0.0001) {
      direction.normalize();
      let speed = cheeseSpeed;
      if (distracted) speed *= 0.3;
      if (time < cheeseSlowUntil) speed *= 0.45;
      const moveAmount = Math.min(speed * dt, targetDistance);
      const nextX = cheeseGroup.position.x + direction.x * moveAmount;
      const nextZ = cheeseGroup.position.z + direction.z * moveAmount;
      if (!isSolid(nextX, cheeseGroup.position.z)) cheeseGroup.position.x = nextX;
      if (!isSolid(cheeseGroup.position.x, nextZ)) cheeseGroup.position.z = nextZ;
    }
  }

  const newDist = horizontalDistance(cheeseGroup.position, camera.position);
  if (newDist <= CHEESE_CATCH_RADIUS && !distracted) { gameOver(); return; }

  // bob & speak more frantically the closer he gets
  const interval = Math.max(0.7, newDist / 6);
  if (newDist < 12 && time - lastCheeseSpeakTime > interval) {
    playCheeseSound();
    lastCheeseSpeakTime = time;
  }
}

function checkNotebookPickup(time) {
  if (isMathActive || isGameOver) return;
  if (time < notebookPickupCooldownUntil) return;
  for (const notebook of notebooks) {
    if (horizontalDistance(camera.position, notebook.position) < NOTEBOOK_PICKUP_RADIUS) {
      showMathModal(notebook);
      break;
    }
  }
}

function checkItemPickup() {
  if (isMathActive || isGameOver) return;
  for (let i = itemPickups.length - 1; i >= 0; i--) {
    const item = itemPickups[i];
    if (horizontalDistance(camera.position, item.position) < ITEM_PICKUP_RADIUS) {
      if (addItem(item.userData.type)) {
        scene.remove(item);
        itemPickups.splice(i, 1);
        showTemporaryHud('PICKED UP ' + ITEM_INFO[item.userData.type].label + '!');
      } else {
        showTemporaryHud('INVENTORY FULL!');
      }
      break;
    }
  }
}

function checkExits() {
  if (!escapeMode || isGameOver) return;
  for (const ex of exits) {
    if (horizontalDistance(camera.position, ex.position) < EXIT_RADIUS) { winGame(); return; }
  }
}

// --- Interaction ---
function isNearVending() {
  return horizontalDistance(camera.position, vendingMachine.position) < VENDING_INTERACT_RADIUS;
}

// Invisible debug-free collider mesh for scene consistency; gameplay collision uses vendingBlocker in isSolid().
const vendingCollider = new THREE.Mesh(
  new THREE.BoxGeometry(0.8, 3, 2.2),
  new THREE.MeshBasicMaterial({ visible: false })
);
vendingCollider.position.copy(vendingMachine.position);
scene.add(vendingCollider);

function tryInteract() {
  if (isMathActive || isGameOver || !gameStarted) return;
  if (isNearVending() && coins > 0 && inventory.includes(null)) {
    coins -= 1;
    addItem(vendingStock);
    showTemporaryHud('BOUGHT ' + ITEM_INFO[vendingStock].label + '!');
    rerollVending();
    renderHud();
  } else if (isNearVending() && !inventory.includes(null)) {
    showTemporaryHud('INVENTORY FULL!');
  } else if (isNearVending() && coins <= 0) {
    showTemporaryHud('NEED A COIN!');
  }
}

function updateVendingPrompt() {
  if (!interactPromptEl) return;
  const hide = isMathActive || isGameOver || !gameStarted || !isNearVending();
  if (hide) { interactPromptEl.style.display = 'none'; return; }
  if (interactButtonEl) {
    interactButtonEl.textContent = `Buy ${ITEM_INFO[vendingStock].label} (1 coin)`;
  }
  interactPromptEl.style.display = 'flex';
}

// Helper: keep sprite billboards upright
function billboardLookAt(mesh, target) {
  mesh.lookAt(target.x, mesh.position.y, target.z);
}

// --- Main Loop ---
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = nowSec();

  if (gameStarted && !isGameOver) {
    updateStamina(dt);
    updatePlayer(dt);
    updateCheese(dt, time);
    checkNotebookPickup(time);
    checkItemPickup();
    checkExits();
    updateVendingPrompt();
  }

  for (const notebook of notebooks) {
    notebook.position.y = notebook.userData.initialY + Math.sin(time * notebook.userData.floatSpeed) * 0.1;
    billboardLookAt(notebook, camera.position);
  }
  for (const item of itemPickups) {
    item.position.y = item.userData.baseY + Math.sin(time * 2) * 0.12;
    billboardLookAt(item, camera.position);
  }
  for (const ex of exits) {
    billboardLookAt(ex, camera.position);
  }
  billboardLookAt(vendingMachine, camera.position);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();