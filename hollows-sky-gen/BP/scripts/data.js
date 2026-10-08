// Saved data. Everything is stored in the world itself, so it survives restarts.
import { world } from "@minecraft/server";
import { PLOTS, RANKS, START_RATING } from "./config.js";

// ---------- Player stats and money ----------

const statsCache = new Map();

function newStats(name) {
  return {
    name,
    money: 0,
    kills: 0,
    deaths: 0,
    mobs: 0,
    mined: 0,
    minutes: 0,
    pick: 0,
    plot: 0,
    rating: START_RATING,
    rankedGames: 0,
    wins: 0,
    losses: 0,
    bestWave: 0,
    pveRuns: 0,
  };
}

function readJson(key) {
  const raw = world.getDynamicProperty(key);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function playerIds() {
  return readJson("hsg:index") ?? [];
}

/** Stats for a player id, or undefined if they never joined. */
export function statsById(id) {
  if (statsCache.has(id)) return statsCache.get(id);
  const saved = readJson(`hsg:p:${id}`);
  if (!saved) return undefined;
  const stats = { ...newStats(saved.name ?? "?"), ...saved };
  statsCache.set(id, stats);
  return stats;
}

/** Stats for an online player. Creates them the first time. */
export function getStats(player) {
  let stats = statsById(player.id);
  if (!stats) {
    stats = newStats(player.name);
    statsCache.set(player.id, stats);
    const ids = playerIds();
    ids.push(player.id);
    world.setDynamicProperty("hsg:index", JSON.stringify(ids));
  }
  stats.name = player.name;
  return stats;
}

export function saveStats(player) {
  const stats = getStats(player);
  world.setDynamicProperty(`hsg:p:${player.id}`, JSON.stringify(stats));
}

export function saveStatsById(id) {
  const stats = statsById(id);
  if (stats) world.setDynamicProperty(`hsg:p:${id}`, JSON.stringify(stats));
}

export function isNewPlayer(player) {
  return statsById(player.id) === undefined;
}

/** Every player who has ever joined: [{ id, stats }]. */
export function allPlayers() {
  const list = [];
  for (const id of playerIds()) {
    const stats = statsById(id);
    if (stats) list.push({ id, stats });
  }
  return list;
}

export function addMoney(player, amount) {
  const stats = getStats(player);
  stats.money = Math.max(0, stats.money + Math.floor(amount));
  saveStats(player);
}

/** Takes money if the player has enough. Returns true if it worked. */
export function trySpend(player, amount) {
  const stats = getStats(player);
  if (stats.money < amount) return false;
  stats.money -= amount;
  saveStats(player);
  return true;
}

export function money(amount) {
  return "$" + Math.floor(amount).toLocaleString("en-US");
}

export function kdr(stats) {
  return stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
}

// ---------- Plots ----------

const plotCache = new Map();

function newPlot() {
  return { owner: "", ownerName: "", gens: 1, level: 0, built: false };
}

/** Plot n (1 to PLOTS.count). Custom x/y/z is set when an admin moves the plot. */
export function getPlot(n) {
  if (plotCache.has(n)) return plotCache.get(n);
  const plot = { ...newPlot(), ...(readJson(`hsg:plot:${n}`) ?? {}) };
  plotCache.set(n, plot);
  return plot;
}

export function savePlot(n) {
  const plot = getPlot(n);
  if (plot.x !== undefined) movedPlots.add(n);
  world.setDynamicProperty(`hsg:plot:${n}`, JSON.stringify(plot));
}

// Plots an admin moved away from the grid. Filled in by loadPlots().
const movedPlots = new Set();

/** Reads every plot once when the world loads. */
export function loadPlots() {
  for (let n = 1; n <= PLOTS.count; n++) if (getPlot(n).x !== undefined) movedPlots.add(n);
}

export function resetPlot(n) {
  const old = getPlot(n);
  const fresh = newPlot();
  // Keep a moved plot where the admin put it, and keep the island that's already there.
  if (old.x !== undefined) Object.assign(fresh, { x: old.x, y: old.y, z: old.z });
  fresh.built = old.built;
  plotCache.set(n, fresh);
  savePlot(n);
}

/** Center of the island's grass layer. */
export function plotCenter(n) {
  const plot = getPlot(n);
  if (plot.x !== undefined) return { x: plot.x, y: plot.y, z: plot.z };
  const i = n - 1;
  return {
    x: PLOTS.baseX + (i % PLOTS.perRow) * PLOTS.spacing,
    y: PLOTS.y,
    z: PLOTS.baseZ + Math.floor(i / PLOTS.perRow) * PLOTS.spacing,
  };
}

const inArea = (location, c) => Math.abs(location.x - c.x) <= PLOTS.protect && Math.abs(location.z - c.z) <= PLOTS.protect;

/** The plot whose area contains this spot, or 0. */
export function plotAt(location) {
  for (const n of movedPlots) if (inArea(location, plotCenter(n))) return n;
  // Grid plots: work out which grid square this is instead of checking all of them.
  const col = Math.round((location.x - PLOTS.baseX) / PLOTS.spacing);
  const row = Math.round((location.z - PLOTS.baseZ) / PLOTS.spacing);
  if (col < 0 || col >= PLOTS.perRow || row < 0) return 0;
  const n = row * PLOTS.perRow + col + 1;
  if (n > PLOTS.count || movedPlots.has(n)) return 0;
  return inArea(location, plotCenter(n)) ? n : 0;
}

export function firstFreePlot() {
  for (let n = 1; n <= PLOTS.count; n++) if (!getPlot(n).owner) return n;
  return 0;
}

// ---------- Hub ----------

export function getHub() {
  return readJson("hsg:hub");
}

export function setHub(location) {
  world.setDynamicProperty("hsg:hub", JSON.stringify(location));
}

// ---------- Ranks ----------

export function rankOf(stats) {
  let rank = RANKS[0];
  for (const r of RANKS) if (stats.rating >= r.min) rank = r;
  return rank;
}

/** e.g. "§eGold" */
export function rankName(stats) {
  const r = rankOf(stats);
  return `${r.color}${r.name}`;
}

/** Shows the player's rank above their head, e.g. "[Gold] Jimmy". */
export function updateNameTag(player) {
  const stats = getStats(player);
  player.nameTag = `§8[${rankName(stats)}§8] §f${player.name}`;
}
