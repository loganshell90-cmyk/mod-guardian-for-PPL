// All the numbers you might want to change live here.

// Seconds a player waits after joining before being sent to their island.
export const JOIN_DELAY_SECONDS = 10;

// 100 sky islands in a 10 x 10 grid, high above the overworld.
export const PLOTS = {
  count: 100,
  perRow: 10,
  spacing: 256, // blocks between island centers
  baseX: 10000,
  baseZ: 10000,
  y: 180, // height of the grass layer
  radius: 7, // island size
  protect: 60, // how far from the center other players can't break or place
};

export const HUB_RADIUS = 12;

// Generator levels. Every generator on an island uses the island's level.
// delay = ticks before the block comes back (20 ticks = 1 second).
export const GEN_LEVELS = [
  { name: "Dirt", block: "minecraft:dirt", cost: 0, delay: 30 },
  { name: "Cobblestone", block: "minecraft:cobblestone", cost: 150, delay: 30 },
  { name: "Coal", block: "minecraft:coal_ore", cost: 500, delay: 35 },
  { name: "Copper", block: "minecraft:copper_ore", cost: 1200, delay: 35 },
  { name: "Iron", block: "minecraft:iron_ore", cost: 2500, delay: 40 },
  { name: "Gold", block: "minecraft:gold_ore", cost: 5000, delay: 40 },
  { name: "Lapis", block: "minecraft:lapis_ore", cost: 9000, delay: 45 },
  { name: "Diamond", block: "minecraft:diamond_ore", cost: 18000, delay: 50 },
  { name: "Emerald", block: "minecraft:emerald_ore", cost: 35000, delay: 55 },
  { name: "Ancient Debris", block: "minecraft:ancient_debris", cost: 70000, delay: 60 },
];

// Where generators sit on an island (x, z from the center). The first one is free.
export const GEN_SPOTS = [
  [3, 0],
  [-3, 0],
  [0, 3],
  [0, -3],
  [3, 3],
];
export const GEN_SLOT_COST = [0, 300, 1500, 6000, 20000];

// What the Money Bot pays for each item.
export const SELL_PRICES = {
  "minecraft:dirt": 1,
  "minecraft:cobblestone": 2,
  "minecraft:coal": 6,
  "minecraft:raw_copper": 4,
  "minecraft:raw_iron": 15,
  "minecraft:raw_gold": 25,
  "minecraft:lapis_lazuli": 6,
  "minecraft:diamond": 120,
  "minecraft:emerald": 220,
  "minecraft:ancient_debris": 600,
};

// Pickaxe upgrade path. enchants = [enchantment, level].
export const PICKAXES = [
  { name: "Wooden Pickaxe", item: "minecraft:wooden_pickaxe", cost: 0, enchants: [["efficiency", 1]] },
  { name: "Wooden Pickaxe+", item: "minecraft:wooden_pickaxe", cost: 50, enchants: [["efficiency", 3], ["unbreaking", 1]] },
  { name: "Stone Pickaxe", item: "minecraft:stone_pickaxe", cost: 150, enchants: [["efficiency", 2]] },
  { name: "Stone Pickaxe+", item: "minecraft:stone_pickaxe", cost: 400, enchants: [["efficiency", 4], ["unbreaking", 2]] },
  { name: "Copper Pickaxe", item: "minecraft:copper_pickaxe", fallback: "minecraft:stone_pickaxe", cost: 900, enchants: [["efficiency", 3], ["unbreaking", 2]] },
  { name: "Copper Pickaxe+", item: "minecraft:copper_pickaxe", fallback: "minecraft:stone_pickaxe", cost: 1600, enchants: [["efficiency", 5], ["unbreaking", 2]] },
  { name: "Iron Pickaxe", item: "minecraft:iron_pickaxe", cost: 3000, enchants: [["efficiency", 3], ["unbreaking", 2]] },
  { name: "Iron Pickaxe+", item: "minecraft:iron_pickaxe", cost: 6000, enchants: [["efficiency", 5], ["unbreaking", 3], ["fortune", 1]] },
  { name: "Diamond Pickaxe", item: "minecraft:diamond_pickaxe", cost: 12000, enchants: [["efficiency", 4], ["unbreaking", 3], ["fortune", 1]] },
  { name: "Diamond Pickaxe+", item: "minecraft:diamond_pickaxe", cost: 25000, enchants: [["efficiency", 5], ["unbreaking", 3], ["fortune", 2]] },
  { name: "Netherite Pickaxe", item: "minecraft:netherite_pickaxe", cost: 50000, enchants: [["efficiency", 5], ["unbreaking", 3], ["fortune", 2]] },
  { name: "Netherite Pickaxe+", item: "minecraft:netherite_pickaxe", cost: 100000, enchants: [["efficiency", 5], ["unbreaking", 3], ["fortune", 3], ["mending", 1]] },
];

// Seconds each leaderboard stays on the side of the screen before switching.
export const LEADERBOARD_SECONDS = 8;
