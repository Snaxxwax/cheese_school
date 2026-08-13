// Cheese School — map grid + world layout

import { TILE_SIZE, GRID_ROWS, GRID_COLS, HALLWAY_TOP, HALLWAY_BOTTOM, HALLWAY_MID } from './config.js';

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

export const itemSpawnCells = [];

classrooms.forEach((room, i) => {
  carveRect(mapGrid, room.x, room.z, room.w, room.h, 3);
  const doorX = room.x + Math.floor(room.w / 2);
  if (room.z < HALLWAY_TOP) mapGrid[HALLWAY_TOP - 1][doorX] = 0;
  else mapGrid[HALLWAY_BOTTOM + 1][doorX] = 0;

  const nbX = room.x + Math.floor(room.w / 2);
  const nbZ = room.z + Math.floor(room.h / 2);
  mapGrid[nbZ][nbX] = 2;

  if (i % 2 === 0) {
    const cx = room.x + 1;
    const cz = room.z + 1;
    if (mapGrid[cz][cx] === 3) {
      const types = ['soda', 'energy', 'catnip'];
      itemSpawnCells.push({ col: cx, row: cz, type: types[(i / 2) % types.length] });
    }
  }
});

export const gridCols = mapGrid[0].length;
export const gridRows = mapGrid.length;
export const offsetX = -(gridCols * TILE_SIZE) / 2;
export const offsetZ = -(gridRows * TILE_SIZE) / 2;

export function cellCenter(col, row) {
  return new THREE.Vector3(
    offsetX + col * TILE_SIZE + TILE_SIZE / 2,
    0,
    offsetZ + row * TILE_SIZE + TILE_SIZE / 2
  );
}

export function isWall(x, z) {
  const { PLAYER_RADIUS } = await import('./config.js');
  // Avoid top-level await / circular issue; import const directly at call site would be ugly.
  // Instead use hardcoded buffer or pass it in. We'll use a tiny closure imported below.
}

// Cheese School — map grid + world layout

import { TILE_SIZE, GRID_ROWS, GRID_COLS, HALLWAY_TOP, HALLWAY_BOTTOM, HALLWAY_MID, PLAYER_RADIUS } from './config.js';

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

export const itemSpawnCells = [];

classrooms.forEach((room, i) => {
  carveRect(mapGrid, room.x, room.z, room.w, room.h, 3);
  const doorX = room.x + Math.floor(room.w / 2);
  if (room.z < HALLWAY_TOP) mapGrid[HALLWAY_TOP - 1][doorX] = 0;
  else mapGrid[HALLWAY_BOTTOM + 1][doorX] = 0;

  const nbX = room.x + Math.floor(room.w / 2);
  const nbZ = room.z + Math.floor(room.h / 2);
  mapGrid[nbZ][nbX] = 2;

  if (i % 2 === 0) {
    const cx = room.x + 1;
    const cz = room.z + 1;
    if (mapGrid[cz][cx] === 3) {
      const types = ['soda', 'energy', 'catnip'];
      itemSpawnCells.push({ col: cx, row: cz, type: types[(i / 2) % types.length] });
    }
  }
});

export const gridCols = mapGrid[0].length;
export const gridRows = mapGrid.length;
export const offsetX = -(gridCols * TILE_SIZE) / 2;
export const offsetZ = -(gridRows * TILE_SIZE) / 2;

export function cellCenter(col, row) {
  return new THREE.Vector3(
    offsetX + col * TILE_SIZE + TILE_SIZE / 2,
    0,
    offsetZ + row * TILE_SIZE + TILE_SIZE / 2
  );
}

export function isWall(x, z) {
  const buffer = PLAYER_RADIUS;
  const corners = [
    { cx: x - buffer, cz: z - buffer }, { cx: x + buffer, cz: z - buffer },
    { cx: x - buffer, cz: z + buffer }, { cx: x + buffer, cz: z + buffer }
  ];
  for (const c of corners) {
    const col = Math.floor((c.cx - offsetX) / TILE_SIZE);
    const row = Math.floor((c.cz - offsetZ) / TILE_SIZE);
    if (row < 0 || row >= gridRows || col < 0 || col >= gridCols) return true;
    if (mapGrid[row][col] === 1) return true;
  }
  return false;
}

export { mapGrid };