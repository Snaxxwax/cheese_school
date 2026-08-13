// Cheese School — centralized game state

export const state = {
  isGameOver: false,
  gameStarted: false,
  isMathActive: false,
  score: 0,
  totalNotebooks: 0,
  coins: 0,
  escapeMode: false,
  catnipActiveUntil: 0,
  catnipTarget: null,
  pendingNotebook: null,
  currentProblem: null,
  pendingImpossible: false,
  inventory: [null, null, null],
  stamina: 1,
  sprinting: false,
  exhausted: false,
  sprintHeld: false,
  sprintBoostUntil: 0,
  cheeseStunnedUntil: 0,
  cheeseSlowUntil: 0,
  cheeseSpeed: 1.6,
  cheeseActiveAt: Infinity,
  notebookPickupCooldownUntil: 0
};

export const view = {
  yaw: 0,
  pitch: 0
};

export const moveState = {
  forward: false,
  backward: false,
  left: false,
  right: false
};

export const joystickVector = { x: 0, y: 0 };

export const inventoryBarState = {
  slotEls: []
};