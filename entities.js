// Cheese School — scene objects: player spawn, Cheese, notebooks, items, exits, vending

import * as THREE from 'three';
import {
  PLAYER_HEIGHT, TILE_SIZE, gridCols, gridRows, offsetX, offsetZ, HALLWAY_MID,
  HALLWAY_TOP, itemSpawnCells, cellCenter, mapGrid
} from './map.js';
import { ITEM_INFO } from './config.js';

export const wallHeight = 3.5;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5e9d0);
scene.fog = new THREE.Fog(0xf5e9d0, 5, 30);

export const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd0c0a0, 0.85);
scene.add(hemiLight);

const loader = new THREE.TextureLoader();

export const wallMat = new THREE.MeshStandardMaterial({ color: 0xc5cbd4, roughness: 0.7 });
export const hallwayFloorMat = new THREE.MeshStandardMaterial({ color: 0xe7d5a3, roughness: 0.9 });
export const classroomFloorMat = new THREE.MeshStandardMaterial({ color: 0x6fa8dc, roughness: 0.8 });

export const notebooks = [];
export const itemPickups = [];
export const exits = [];

function buildEnvironment(totalNotebooksRef) {
  const wallGeo = new THREE.BoxGeometry(TILE_SIZE, wallHeight, TILE_SIZE);

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const xPos = offsetX + col * TILE_SIZE + TILE_SIZE / 2;
      const zPos = offsetZ + row * TILE_SIZE + TILE_SIZE / 2;
      const cell = mapGrid[row][col];
      if (cell === 1) {
        const mesh = new THREE.Mesh(wallGeo, wallMat);
        mesh.position.set(xPos, wallHeight / 2, zPos);
        scene.add(mesh);
      } else {
        const isClassroomFloor = cell === 3 || cell === 2;
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE),
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
          totalNotebooksRef.value++;
        }
      }
    }
  }
}