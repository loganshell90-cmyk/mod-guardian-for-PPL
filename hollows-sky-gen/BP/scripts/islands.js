// Building islands, generators, teleporting, bots and floating leaderboards.
import { system, world, GameMode } from "@minecraft/server";
import { GEN_LEVELS, GEN_SPOTS, HUB_RADIUS, PLOTS } from "./config.js";
import { getHub, getPlot, getStats, plotAt, plotCenter, savePlot, saveStats } from "./data.js";

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
export function sendToPlot(player, n, isOwner) {
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
  if (!stats.plot) return player.sendMessage("§cYou don't have an island. All 100 plots are taken.");
  sendToPlot(player, stats.plot, true);
}

export function sendToHub(player) {
  const hub = getHub();
  if (!hub) return player.sendMessage("§cThere's no hub yet. An admin can build one from the Sky Menu.");
  player.teleport({ x: hub.x + 0.5, y: hub.y + 1, z: hub.z + 0.5 }, { dimension: overworld() });
}

/** Builds a big island under the player and puts the bots and a leaderboard on it. */
export function buildHub(player) {
  const l = player.location;
  const c = { x: Math.floor(l.x), y: Math.floor(l.y) - 1, z: Math.floor(l.z) };
  buildIsland(c, HUB_RADIUS);
  world.setDynamicProperty("hsg:hub", JSON.stringify(c));
  spawnBot("money", { x: c.x - 4 + 0.5, y: c.y + 1, z: c.z - 6 + 0.5 });
  spawnBot("upgrade", { x: c.x + 4 + 0.5, y: c.y + 1, z: c.z - 6 + 0.5 });
  spawnBoard({ x: c.x + 0.5, y: c.y + 4, z: c.z - 8.5 });
}

export const BOT_NAMES = {
  money: "§a§lMoney Bot\n§r§7Sell your stuff",
  upgrade: "§b§lUpgrade Bot\n§r§7Pickaxes & generators",
};

export function spawnBot(role, location) {
  const bot = overworld().spawnEntity("hsg:bot", location);
  bot.setDynamicProperty("role", role);
  bot.nameTag = BOT_NAMES[role];
}

/** Every 2 seconds: catch anyone falling off an island and put them back. */
export function startFallCatcher() {
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
