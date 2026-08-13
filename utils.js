// Cheese School — utility helpers

export const nowSec = () => performance.now() / 1000;

export function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}