// Cheese School — constants / tuning

export const PLAYER_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_SPEED = 5.2;
export const SPRINT_MULT = 1.75;
export const STAMINA_DRAIN = 0.55;
export const STAMINA_REGEN = 0.32;
export const STAMINA_RESPRINT = 0.3;

export const CHEESE_START_SPEED = 1.6;
export const CHEESE_MAX_SPEED = 8.0;
export const CHEESE_SPEED_PER_NOTEBOOK = 0.55;
export const CHEESE_WRONG_ANSWER_SPEED_BOOST = 0.45;
export const CHEESE_IMPOSSIBLE_BOOST = 1.4;
export const CHEESE_ESCAPE_BOOST = 1.6;
export const CHEESE_CATCH_RADIUS = 1.25;
export const CHEESE_GRACE_SECONDS = 3.0;

export const NOTEBOOK_PICKUP_RADIUS = 1.5;
export const NOTEBOOK_PICKUP_COOLDOWN_SECONDS = 0.75;
export const ITEM_PICKUP_RADIUS = 1.4;
export const EXIT_RADIUS = 1.6;

export const INVENTORY_SIZE = 3;

export const VENDING_ITEMS = ['catnip', 'soda', 'energy'];
export const VENDING_INTERACT_RADIUS = 2.5;

export const ITEM_INFO = {
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

export const TILE_SIZE = 4;
export const GRID_ROWS = 17;
export const GRID_COLS = 29;
export const HALLWAY_TOP = 7;
export const HALLWAY_BOTTOM = 9;
export const HALLWAY_MID = 8;