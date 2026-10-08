// Building islands, generators, teleporting, bots and floating leaderboards.
import { system, world, GameMode } from "@minecraft/server";
import { GEN_LEVELS, GEN_SPOTS, HUB_BOTS, HUB_DEFAULT, HUB_RADIUS, PLOTS } from "./config.js";
import { firstFreePlot, getHub, getPlot, getStats, plotAt, plotCenter, resetPlot, savePlot, saveStats, saveStatsById, statsById } from "./data.js";

const overworld = () => world.getDimension("overworld");

// "x,y,z" of every generator block -> plot number.
const genIndex = new Map();
const key = (l) => `${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`;

export function genLocations(n) {
  const c = plotCenter(n);
  return GEN_SPOTS.slice(0, getPlot(n).gens).map(([dx, dz]) => ({ x: c.x + dx, y: c.y + 1, z: c.z + dz }));
}

export function rebuildGenIndex() {
  genIndex.clear();
  for (let n = 1; n <= PLOTS.count; n++) {
    if (!getPlot(n).owner) continue;
    for (const l of genLocations(n)) genIndex.set(key(l), n);
  }
}

export function plotForGenerator(location) {
  return genIndex.get(key(location)) ?? 0;
}

/** Makes a round floating island. Returns false if that area isn't loaded yet. */
function buildIsland(c, radius) {
  const dim = overworld();
  if (!dim.getBlock(c)) return false;
  const layers = ["minecraft:grass_block", "minecraft:dirt", "minecraft:dirt", "minecraft:stone", "minecraft:stone", "minecraft:stone"];
  layers.forEach((type, depth) => {
    const r = radius - depth;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r + r * 0.5) continue;
        dim.getBlock({ x: c.x + dx, y: c.y - depth, z: c.z + dz })?.setType(type);
      }
    }
  });
  return true;
}

/** Puts back the generator block (and the bedrock under it) if it's missing. */
function placeGenerator(n, l) {
  const block = overworld().getBlock(l);
  if (!block) return;
  overworld().getBlock({ x: l.x, y: l.y - 1, z: l.z })?.setType("minecraft:bedrock");
  if (block.isAir) block.setType(GEN_LEVELS[getPlot(n).level].block);
}

/** Generator was mined: bring it back after the level's delay. */
export function regenerate(n, location) {
  const level = GEN_LEVELS[getPlot(n).level];
  system.runTimeout(() => {
    try {
      const block = overworld().getBlock(location);
      if (block?.isAir) block.setType(GEN_LEVELS[getPlot(n).level].block);
    } catch {
      // Area unloaded; it's refilled next time someone visits.
    }
  }, level.delay);
}

/** Changes every generator on the island to the current level's block. */
export function refreshGenerators(n) {
  for (const l of genLocations(n)) {
    const block = overworld().getBlock(l);
    if (block) block.setType(GEN_LEVELS[getPlot(n).level].block);
  }
}

function spawnBoard(location) {
  const dim = overworld();
  if (dim.getEntities({ type: "hsg:text", location, maxDistance: 3 }).length > 0) return;
  dim.spawnEntity("hsg:text", location).nameTag = "§6Leaderboard\n§7loading...";
}

/** Builds the island, generators and leaderboard if needed. False if not loaded yet. */
export function preparePlot(n) {
  const plot = getPlot(n);
  const c = plotCenter(n);
  if (!overworld().getBlock(c)) return false;
  if (!plot.built) {
    buildIsland(c, PLOTS.radius);
    plot.built = true;
    savePlot(n);
  }
  for (const l of genLocations(n)) placeGenerator(n, l);
  spawnBoard({ x: c.x + 0.5, y: c.y + 3.5, z: c.z - 5.5 });
  return true;
}

/**
 * Teleports a player to an island. Slow falling keeps them safe while the
 * area loads; then the island is built and they're moved onto it.
 */
// PvP sets this so players can't teleport out of a match. Returns a message, or "" if allowed.
let travelBlocker = (_player) => "";
export function setTravelBlocker(fn) {
  travelBlocker = fn;
}

export function sendToPlot(player, n, isOwner) {
  const blocked = travelBlocker(player);
  if (blocked) return player.sendMessage(blocked);
  const c = plotCenter(n);
  const spawn = { x: c.x + 0.5, y: c.y + 1, z: c.z + 0.5 };
  player.addEffect("slow_falling", 400, { showParticles: false });
  player.addEffect("resistance", 200, { amplifier: 4, showParticles: false });
  player.teleport({ x: spawn.x, y: spawn.y + 2, z: spawn.z }, { dimension: overworld() });

  let tries = 0;
  const job = system.runInterval(() => {
    tries++;
    if (!player.isValid) return system.clearRun(job);
    let ready = false;
    try {
      ready = preparePlot(n);
    } catch {
      ready = false;
    }
    if (ready) {
      system.clearRun(job);
      player.teleport(spawn, { dimension: overworld() });
      player.removeEffect("slow_falling");
      if (isOwner) player.setSpawnPoint({ dimension: overworld(), ...spawn });
      const plot = getPlot(n);
      player.onScreenDisplay.setTitle(isOwner ? "§bYour Island" : `§bIsland ${n}`, {
        subtitle: `§7Plot ${n} - ${plot.ownerName}`,
        fadeInDuration: 5,
        stayDuration: 40,
        fadeOutDuration: 10,
      });
    } else if (tries > 60) {
      system.clearRun(job);
      player.sendMessage("§cThe island took too long to load. Try /plot again.");
    }
  }, 5);
}

export function sendHome(player) {
  const stats = getStats(player);
  if (!stats.plot) return player.sendMessage(`§cYou don't have an island. All ${PLOTS.count} plots are taken.`);
  sendToPlot(player, stats.plot, true);
}

export function sendToHub(player) {
  const blocked = travelBlocker(player);
  if (blocked) return player.sendMessage(blocked);
  const hub = getHub() ?? HUB_DEFAULT;
  const spot = { x: hub.x + 0.5, y: hub.y + 1, z: hub.z + 0.5 };
  if (getHub() && overworld().getBlock(hub)) {
    ensureHubBots();
    return player.teleport(spot, { dimension: overworld() });
  }
  // The hub area isn't loaded (or doesn't exist yet): wait for it, then build it if needed.
  player.addEffect("slow_falling", 400, { showParticles: false });
  player.teleport({ ...spot, y: spot.y + 2 }, { dimension: overworld() });
  let tries = 0;
  const job = system.runInterval(() => {
    tries++;
    if (!player.isValid) return system.clearRun(job);
    if (!overworld().getBlock(hub)) {
      if (tries > 60) {
        system.clearRun(job);
        player.sendMessage("§cThe hub took too long to load. Try /hub again.");
      }
      return;
    }
    system.clearRun(job);
    if (!getHub()) buildHubAt(hub);
    ensureHubBots();
    player.teleport(spot, { dimension: overworld() });
    player.removeEffect("slow_falling");
  }, 5);
}

/** Builds a big island under the player and puts the bots and a leaderboard on it. */
/** Admin tool: builds the hub under the player instead of the default spot. */
export function buildHub(player) {
  const l = player.location;
  buildHubAt({ x: Math.floor(l.x), y: Math.floor(l.y) - 1, z: Math.floor(l.z) });
  ensureHubBots();
}

function buildHubAt(c) {
  buildIsland(c, HUB_RADIUS);
  world.setDynamicProperty("hsg:hub", JSON.stringify(c));
}

/**
 * Spawns any hub bot that's missing (and the leaderboard). Only works while
 * the hub is loaded, which is whenever a player is near it.
 */
export function ensureHubBots() {
  const hub = getHub();
  if (!hub || !overworld().getBlock(hub)) return;
  const near = overworld().getEntities({ type: "hsg:bot", location: hub, maxDistance: HUB_RADIUS + 20 });
  for (const [role, [dx, dz]] of Object.entries(HUB_BOTS)) {
    if (near.some((bot) => bot.getDynamicProperty("role") === role)) continue;
    spawnBot(role, { x: hub.x + dx + 0.5, y: hub.y + 1, z: hub.z + dz + 0.5 });
  }
  spawnBoard({ x: hub.x + 0.5, y: hub.y + 4, z: hub.z - 8.5 });
}

export const BOT_NAMES = {
  money: "§a§lMoney Bot\n§r§7Sell your stuff",
  upgrade: "§b§lUpgrade Bot\n§r§7Pickaxes & generators",
  pvp: "§c§lPvP Bot\n§r§7Casual & Ranked matches",
  shop: "§d§lPvP Shop\n§r§7Gear for fighting",
};

export function spawnBot(role, location) {
  const bot = overworld().spawnEntity("hsg:bot", location);
  bot.setDynamicProperty("role", role);
  bot.nameTag = BOT_NAMES[role];
}

/** Every 2 seconds: catch anyone falling off an island and put them back. */
export function startFallCatcher() {
  // Every 10 seconds: bring back any hub bot that went missing.
  system.runInterval(() => {
    try {
      ensureHubBots();
    } catch {
      // Hub not loaded right now.
    }
  }, 200);

  system.runInterval(() => {
    const hub = getHub();
    for (const player of world.getAllPlayers()) {
      if (player.dimension.id !== "minecraft:overworld") continue;
      const mode = player.getGameMode();
      if (mode === GameMode.Creative || mode === GameMode.Spectator) continue;
      const l = player.location;
      if (hub && Math.abs(l.x - hub.x) < 60 && Math.abs(l.z - hub.z) < 60 && l.y < hub.y - 25) {
        sendToHub(player);
        continue;
      }
      const n = plotAt(l);
      if (n && l.y < plotCenter(n).y - 25) {
        const own = getStats(player).plot === n;
        sendToPlot(player, n, own);
      }
    }
  }, 40);
}

/** Gives a player their first island. Returns the plot number, or 0 if full. */
export function claimPlot(player, n) {
  const plot = getPlot(n);
  plot.owner = player.id;
  plot.ownerName = player.name;
  savePlot(n);
  const stats = getStats(player);
  stats.plot = n;
  saveStats(player);
  rebuildGenIndex();
  return n;
}

/**
 * Admin tool: puts a player on a different plot. Their generator upgrades go
 * with them. If someone already owns that plot, the two players swap.
 * Returns a message saying what happened.
 */
export function movePlayerToPlot(playerId, n) {
  const stats = statsById(playerId);
  if (!stats) return "§cThat player has never joined.";
  const from = stats.plot;
  if (from === n) return `§e${stats.name} is already on plot ${n}.`;

  const target = getPlot(n);
  const otherId = target.owner;
  const mine = from ? getPlot(from) : undefined;
  const myUpgrades = mine ? { gens: mine.gens, level: mine.level } : { gens: 1, level: 0 };
  const theirUpgrades = { gens: target.gens, level: target.level };
  let otherNewPlot = from;

  if (otherId && from) {
    // Swap: the other player gets this player's old plot, with their own upgrades.
    const other = statsById(otherId);
    Object.assign(mine, { owner: otherId, ownerName: other?.name ?? target.ownerName, ...theirUpgrades });
    savePlot(from);
    if (other) {
      other.plot = from;
      saveStatsById(otherId);
    }
  } else if (otherId) {
    // This player had no plot to swap, so the other player moves to the next
    // free plot and keeps their upgrades (or has none if every plot is taken).
    const other = statsById(otherId);
    target.owner = playerId; // so firstFreePlot skips it
    const spare = firstFreePlot();
    if (spare) {
      Object.assign(getPlot(spare), { owner: otherId, ownerName: other?.name ?? target.ownerName, ...theirUpgrades });
      savePlot(spare);
    }
    if (other) {
      other.plot = spare;
      saveStatsById(otherId);
    }
    otherNewPlot = spare;
  } else if (from) {
    resetPlot(from);
  }

  Object.assign(target, { owner: playerId, ownerName: stats.name, ...myUpgrades });
  savePlot(n);
  stats.plot = n;
  saveStatsById(playerId);
  rebuildGenIndex();

  // Update generators that are loaded right now, and move anyone who's online.
  for (const plot of [n, from, otherNewPlot].filter(Boolean)) {
    try {
      if (preparePlot(plot)) refreshGenerators(plot);
    } catch {
      // Not loaded; fixed next time someone visits.
    }
  }
  const otherName = otherId ? statsById(otherId)?.name ?? target.ownerName : "";
  for (const p of world.getAllPlayers()) {
    if (p.id === playerId) {
      p.sendMessage(`§eAn admin moved you to plot ${n}.`);
      sendToPlot(p, n, true);
    } else if (p.id === otherId) {
      p.sendMessage(otherNewPlot ? `§eAn admin moved you to plot ${otherNewPlot}.` : "§eAn admin gave your plot to someone else.");
      if (otherNewPlot) sendToPlot(p, otherNewPlot, true);
    }
  }

  if (otherId && from) return `§aSwapped: ${stats.name} is now on plot ${n} and ${otherName} is on plot ${from}.`;
  if (otherId) return `§a${stats.name} is now on plot ${n}. ${otherName} ${otherNewPlot ? `moved to plot ${otherNewPlot}` : "has no plot now (all plots are taken)"}.`;
  return `§a${stats.name} is now on plot ${n}.`;
}
