// All the numbers you might want to change live here.

// Seconds a player waits after joining before being sent to their island.
export const JOIN_DELAY_SECONDS = 10;

// 350 sky islands in a 19 x 19 grid, high above the overworld.
export const PLOTS = {
  count: 350,
  perRow: 19,
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

// ---------- PvP (Part 2) ----------

// Arenas float far away from the islands. Each one runs one match at a time.
export const ARENAS = {
  baseX: -10000,
  baseZ: -10000,
  y: 160,
  spacing: 200,
  count1v1: 4,
  count2v2: 4,
  radius1v1: 12,
  radius2v2: 16,
};

// Money for winning. Everyone on the winning team gets it.
export const PVP_PRIZE = { casual: 50, ranked: 100 };

// Ranked: everyone starts at 1000. Win and it goes up, lose and it goes down.
export const START_RATING = 1000;
export const RATING_K = 32; // the most a single match can change your rating

// Rank tiers, lowest first. min = rating needed.
export const RANKS = [
  { name: "Bronze", color: "§6", min: 0 },
  { name: "Silver", color: "§7", min: 1100 },
  { name: "Gold", color: "§e", min: 1250 },
  { name: "Diamond", color: "§b", min: 1400 },
  { name: "Netherite", color: "§5", min: 1600 },
];

// Ranked matchmaking: how far apart ratings can be. Grows the longer people wait.
export const RANKED_RANGE = { start: 150, growPer10s: 50 };

// PvP Shop Bot. items = [item, amount].
export const PVP_SHOP = [
  { name: "Golden Apple", cost: 150, items: [["minecraft:golden_apple", 1]] },
  { name: "Ender Pearls x4", cost: 200, items: [["minecraft:ender_pearl", 4]] },
  { name: "Steak x16", cost: 50, items: [["minecraft:cooked_beef", 16]] },
  { name: "Shield", cost: 150, items: [["minecraft:shield", 1]] },
  { name: "Bow + 32 Arrows", cost: 300, items: [["minecraft:bow", 1], ["minecraft:arrow", 32]] },
  { name: "Iron Sword", cost: 200, items: [["minecraft:iron_sword", 1]] },
  { name: "Diamond Sword", cost: 1000, items: [["minecraft:diamond_sword", 1]] },
  {
    name: "Iron Armor Set",
    cost: 800,
    items: [["minecraft:iron_helmet", 1], ["minecraft:iron_chestplate", 1], ["minecraft:iron_leggings", 1], ["minecraft:iron_boots", 1]],
  },
  {
    name: "Diamond Armor Set",
    cost: 4000,
    items: [["minecraft:diamond_helmet", 1], ["minecraft:diamond_chestplate", 1], ["minecraft:diamond_leggings", 1], ["minecraft:diamond_boots", 1]],
  },
  { name: "Totem of Undying", cost: 3000, items: [["minecraft:totem_of_undying", 1]] },
  { name: "Enchanted Golden Apple", cost: 2500, items: [["minecraft:enchanted_golden_apple", 1]] },
];
