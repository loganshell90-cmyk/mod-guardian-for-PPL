// Saved data. Everything is stored in the world itself, so it survives restarts.
import { world } from "@minecraft/server";
import { PLOTS } from "./config.js";

// ---------- Player stats and money ----------

const statsCache = new Map();

function newStats(name) {
  return { name, money: 0, kills: 0, deaths: 0, mobs: 0, mined: 0, minutes: 0, pick: 0, plot: 0 };
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

/** Plot n (1 to 100). Custom x/y/z is set when an admin moves the plot. */
export function getPlot(n) {
  if (plotCache.has(n)) return plotCache.get(n);
  const plot = { ...newPlot(), ...(readJson(`hsg:plot:${n}`) ?? {}) };
  plotCache.set(n, plot);
  return plot;
}

export function savePlot(n) {
  world.setDynamicProperty(`hsg:plot:${n}`, JSON.stringify(getPlot(n)));
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

/** The plot whose area contains this spot, or 0. */
export function plotAt(location) {
  for (let n = 1; n <= PLOTS.count; n++) {
    const c = plotCenter(n);
    if (Math.abs(location.x - c.x) <= PLOTS.protect && Math.abs(location.z - c.z) <= PLOTS.protect) return n;
  }
  return 0;
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
