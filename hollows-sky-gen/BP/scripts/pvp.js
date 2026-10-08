// PvP: queues, arenas, matches and ranked ratings.
import { BlockVolume, EquipmentSlot, GameMode, Player, system, world } from "@minecraft/server";
import { ARENAS, PVP_PRIZE, RANKED_RANGE, RATING_K } from "./config.js";
import { addMoney, getStats, money, rankName, saveStats, saveStatsById, statsById, updateNameTag } from "./data.js";
import { sendHome, setTravelBlocker } from "./islands.js";

const overworld = () => world.getDimension("overworld");

// ---------- Arenas ----------

/** Every arena: { id, size, center, radius }. size = players per team. */
export const arenas = [];
for (let i = 0; i < ARENAS.count1v1; i++) {
  arenas.push({ id: `1v1-${i + 1}`, size: 1, radius: ARENAS.radius1v1, center: { x: ARENAS.baseX + i * ARENAS.spacing, y: ARENAS.y, z: ARENAS.baseZ } });
}
for (let i = 0; i < ARENAS.count2v2; i++) {
  arenas.push({
    id: `2v2-${i + 1}`,
    size: 2,
    radius: ARENAS.radius2v2,
    center: { x: ARENAS.baseX + i * ARENAS.spacing, y: ARENAS.y, z: ARENAS.baseZ + ARENAS.spacing },
  });
}

export function arenaAt(location) {
  return arenas.find((a) => Math.abs(location.x - a.center.x) <= a.radius + 6 && Math.abs(location.z - a.center.z) <= a.radius + 6);
}

/** Builds a square arena with glass walls. False if the area isn't loaded yet. */
function buildArena(arena) {
  const dim = overworld();
  const { x, y, z } = arena.center;
  const r = arena.radius;
  if (!dim.getBlock(arena.center)) return false;
  if (world.getDynamicProperty(`hsg:arena:${arena.id}`)) return true;
  const fill = (x1, y1, z1, x2, y2, z2, block) => dim.fillBlocks(new BlockVolume({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }), block);
  fill(x - r, y - 1, z - r, x + r, y - 1, z + r, "minecraft:stone");
  fill(x - r, y, z - r, x + r, y, z + r, "minecraft:stone_bricks");
  fill(x - r, y + 1, z - r, x + r, y + 4, z - r, "minecraft:glass");
  fill(x - r, y + 1, z + r, x + r, y + 4, z + r, "minecraft:glass");
  fill(x - r, y + 1, z - r, x - r, y + 4, z + r, "minecraft:glass");
  fill(x + r, y + 1, z - r, x + r, y + 4, z + r, "minecraft:glass");
  // A few pillars to hide behind.
  for (const [dx, dz] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) fill(x + dx, y + 1, z + dz, x + dx, y + 3, z + dz, "minecraft:mossy_stone_bricks");
  world.setDynamicProperty(`hsg:arena:${arena.id}`, true);
  return true;
}

// ---------- Queues ----------

export const QUEUES = {
  "casual-1": { name: "Casual 1v1", ranked: false, size: 1 },
  "casual-2": { name: "Casual 2v2", ranked: false, size: 2 },
  "ranked-1": { name: "Ranked 1v1", ranked: true, size: 1 },
  "ranked-2": { name: "Ranked 2v2", ranked: true, size: 2 },
};
/** queue key -> [{ id, since }] */
const waiting = Object.fromEntries(Object.keys(QUEUES).map((k) => [k, []]));

export function queueOf(player) {
  return Object.keys(waiting).find((k) => waiting[k].some((e) => e.id === player.id));
}

export function leaveQueue(playerOrId) {
  const id = typeof playerOrId === "string" ? playerOrId : playerOrId.id;
  for (const k of Object.keys(waiting)) waiting[k] = waiting[k].filter((e) => e.id !== id);
}

export function joinQueue(player, key) {
  if (inMatch(player)) return player.sendMessage("§cYou're already in a match.");
  leaveQueue(player);
  waiting[key].push({ id: player.id, since: system.currentTick });
  player.sendMessage(`§aJoined the ${QUEUES[key].name} queue. You can keep playing while you wait.`);
}

export function queueCount(key) {
  return waiting[key].length;
}

const online = () => new Map(world.getAllPlayers().map((p) => [p.id, p]));

/** Every 2 seconds: start matches for anyone who can be paired up. */
function matchmake() {
  const players = online();
  for (const [key, info] of Object.entries(QUEUES)) {
    // Drop anyone who left the game or got into a match some other way.
    waiting[key] = waiting[key].filter((e) => players.has(e.id) && !playerMatch.has(e.id));
    const need = info.size * 2;

    while (waiting[key].length >= need) {
      const arena = arenas.find((a) => a.size === info.size && !busyArenas.has(a.id));
      if (!arena) break;
      const group = info.ranked ? pickRanked(waiting[key], need) : waiting[key].slice(0, need);
      if (!group) break;
      waiting[key] = waiting[key].filter((e) => !group.includes(e));
      const ps = group.map((e) => players.get(e.id));
      // Ranked 2v2: best + worst vs the two middle players, to keep teams even.
      const teams = info.size === 1 ? [[ps[0]], [ps[1]]] : info.ranked ? [[ps[0], ps[3]], [ps[1], ps[2]]] : [ps.slice(0, 2), ps.slice(2)];
      startMatch(arena, key, teams);
    }

    for (const e of waiting[key]) {
      const secs = Math.floor((system.currentTick - e.since) / 20);
      players
        .get(e.id)
        ?.onScreenDisplay.setActionBar(`§eIn queue: ${info.name} §7- ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} - ${waiting[key].length}/${need} players`);
    }
  }
}

/** Finds players with close ratings. The allowed gap grows the longer people wait. */
function pickRanked(list, need) {
  const sorted = [...list].sort((a, b) => statsById(a.id).rating - statsById(b.id).rating);
  for (let i = 0; i + need <= sorted.length; i++) {
    const group = sorted.slice(i, i + need);
    const longest = Math.max(...group.map((e) => system.currentTick - e.since)) / 20;
    const allowed = RANKED_RANGE.start + RANKED_RANGE.growPer10s * Math.floor(longest / 10);
    const gap = statsById(group[need - 1].id).rating - statsById(group[0].id).rating;
    if (gap <= allowed) return group.reverse(); // highest rating first
  }
  return undefined;
}

// ---------- Matches ----------

const busyArenas = new Set();
/** player id -> match */
const playerMatch = new Map();

export const inMatch = (player) => playerMatch.has(player.id);

function heal(player) {
  player.getComponent("minecraft:health")?.resetToMaxValue();
  player.extinguishFire();
  player.addEffect("saturation", 5, { amplifier: 10, showParticles: false });
}

function tellMatch(match, text) {
  for (const p of matchPlayers(match)) p.sendMessage(text);
}

function matchPlayers(match) {
  return match.teams.flat().map((id) => world.getEntity(id)).filter((p) => p instanceof Player && p.isValid);
}

function startMatch(arena, key, teams) {
  const match = { arena, key, info: QUEUES[key], teams: teams.map((t) => t.map((p) => p.id)), alive: new Set(), lastHit: new Map(), started: false, ended: false };
  busyArenas.add(arena.id);
  const all = teams.flat();
  for (const p of all) {
    playerMatch.set(p.id, match);
    match.alive.add(p.id);
    // Remember where they were, saved on the player in case the game closes mid-match.
    const l = p.location;
    p.setDynamicProperty("hsg:return", JSON.stringify({ x: l.x, y: l.y, z: l.z, dim: p.dimension.id, mode: p.getGameMode() }));
    p.addEffect("slow_falling", 300, { showParticles: false });
    p.teleport({ x: arena.center.x + 0.5, y: arena.center.y + 6, z: arena.center.z + 0.5 }, { dimension: overworld() });
  }
  const names = teams.map((t) => t.map((p) => p.name).join(" & "));
  tellMatch(match, `§6${match.info.name}: §f${names[0]} §7vs §f${names[1]}`);

  // Wait for the arena to load, build it if needed, then put everyone in place.
  let tries = 0;
  const job = system.runInterval(() => {
    tries++;
    let ready = false;
    try {
      ready = buildArena(arena);
    } catch {
      ready = false;
    }
    if (!ready && tries < 60) return;
    system.clearRun(job);
    if (!ready) {
      tellMatch(match, "§cThe arena didn't load. Match cancelled.");
      return finish(match);
    }
    const r = arena.radius - 3;
    match.teams.forEach((team, t) => {
      team.forEach((id, i) => {
        const p = world.getEntity(id);
        if (!(p instanceof Player)) return;
        const offset = team.length === 1 ? 0 : i === 0 ? -2 : 2;
        const spot = { x: arena.center.x + offset + 0.5, y: arena.center.y + 1, z: arena.center.z + (t === 0 ? -r : r) + 0.5 };
        p.teleport(spot, { dimension: overworld(), facingLocation: { ...arena.center, y: arena.center.y + 1 } });
        p.removeEffect("slow_falling");
        heal(p);
        p.addEffect("slowness", 100, { amplifier: 255, showParticles: false });
      });
    });
    countdown(match, 5);
  }, 5);
}

function countdown(match, left) {
  if (match.ended) return;
  for (const p of matchPlayers(match)) {
    p.onScreenDisplay.setTitle(left > 0 ? `§e${left}` : "§c§lFIGHT!", { fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 5 });
    p.playSound(left > 0 ? "note.hat" : "mob.wither.spawn", { volume: left > 0 ? 1 : 0.4 });
  }
  if (left > 0) return system.runTimeout(() => countdown(match, left - 1), 20);
  match.started = true;
  for (const p of matchPlayers(match)) p.removeEffect("slowness");
}

/** A player is out. killerId is who gets the kill, if anyone. */
function eliminate(id, killerId) {
  const match = playerMatch.get(id);
  if (!match || match.ended || !match.alive.has(id)) return;
  match.alive.delete(id);

  const victim = world.getEntity(id);
  const victimStats = statsById(id);
  if (victimStats) {
    victimStats.deaths++;
    saveStatsById(id);
  }
  const found = killerId && match.alive.has(killerId) ? world.getEntity(killerId) : undefined;
  const killer = found instanceof Player ? found : undefined;
  if (killer) {
    getStats(killer).kills++;
    saveStats(killer);
  }
  tellMatch(match, killer ? `§c${victimStats?.name} was eliminated by ${killer.name}` : `§c${victimStats?.name} was eliminated`);

  if (victim instanceof Player && victim.isValid) {
    heal(victim);
    victim.setGameMode(GameMode.Spectator);
    victim.onScreenDisplay.setTitle("§cEliminated", { fadeInDuration: 0, stayDuration: 40, fadeOutDuration: 10 });
  }

  const teamsLeft = match.teams.map((team) => team.filter((m) => match.alive.has(m)).length);
  if (teamsLeft[0] === 0) endMatch(match, 1);
  else if (teamsLeft[1] === 0) endMatch(match, 0);
}

function endMatch(match, winner) {
  match.ended = true;
  const ranked = match.info.ranked;
  const prize = ranked ? PVP_PRIZE.ranked : PVP_PRIZE.casual;

  // Ranked rating change: beating a stronger team gives more, beating a weaker team gives less.
  let change = 0;
  if (ranked) {
    const avg = (team) => team.reduce((sum, id) => sum + (statsById(id)?.rating ?? 0), 0) / team.length;
    const expected = 1 / (1 + Math.pow(10, (avg(match.teams[1 - winner]) - avg(match.teams[winner])) / 400));
    change = Math.max(1, Math.round(RATING_K * (1 - expected)));
  }

  match.teams.forEach((team, t) => {
    const won = t === winner;
    for (const id of team) {
      const stats = statsById(id);
      if (!stats) continue;
      if (won) stats.wins++;
      else stats.losses++;
      if (ranked) {
        stats.rankedGames++;
        stats.rating = Math.max(0, stats.rating + (won ? change : -change));
      }
      saveStatsById(id);
      const p = world.getEntity(id);
      if (!(p instanceof Player)) continue;
      if (won) addMoney(p, prize);
      const sub = [won ? `§a+${money(prize)}` : "", ranked ? `${won ? "§a+" : "§c-"}${change} rating §7(${rankName(stats)}§7)` : ""].filter(Boolean).join("  ");
      p.onScreenDisplay.setTitle(won ? "§a§lVICTORY" : "§c§lDEFEAT", { subtitle: sub, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
      p.playSound(won ? "random.levelup" : "mob.villager.no");
    }
  });
  system.runTimeout(() => finish(match), 60);
}

/** Sends everyone back to where they were and frees the arena. */
function finish(match) {
  match.ended = true;
  for (const id of match.teams.flat()) {
    playerMatch.delete(id);
    const p = world.getEntity(id);
    if (p instanceof Player && p.isValid) returnPlayer(p);
  }
  busyArenas.delete(match.arena.id);
}

/** Puts a player back where they were before the match. Also used when they rejoin. */
export function returnPlayer(player) {
  const raw = player.getDynamicProperty("hsg:return");
  player.setDynamicProperty("hsg:return", undefined);
  heal(player);
  player.removeEffect("slowness");
  updateNameTag(player);
  if (typeof raw !== "string") return;
  let back;
  try {
    back = JSON.parse(raw);
  } catch {
    return sendHome(player);
  }
  player.setGameMode(back.mode ?? GameMode.Survival);
  player.teleport({ x: back.x, y: back.y, z: back.z }, { dimension: world.getDimension(back.dim ?? "overworld") });
}

/** True if the player has to come back from a match they were in when they left. */
export function needsReturn(player) {
  return typeof player.getDynamicProperty("hsg:return") === "string" && !playerMatch.has(player.id);
}

// ---------- Events ----------

const TOTEM = "minecraft:totem_of_undying";

function holdingTotem(player) {
  const eq = player.getComponent("minecraft:equippable");
  return eq?.getEquipment(EquipmentSlot.Offhand)?.typeId === TOTEM || eq?.getEquipment(EquipmentSlot.Mainhand)?.typeId === TOTEM;
}

export function startPvp() {
  // Can't use /plot or /hub to run away from a match.
  setTravelBlocker((player) => (playerMatch.get(player.id)?.ended === false ? "§cFinish your match first." : ""));

  // Arena hits: no friendly fire, no outsiders, and a killing hit eliminates
  // instead of killing, so nobody drops their stuff.
  world.beforeEvents.entityHurt.subscribe((ev) => {
    const victim = ev.hurtEntity;
    if (!(victim instanceof Player)) return;
    const match = playerMatch.get(victim.id);
    if (!match) return;
    if (!match.started || match.ended || !match.alive.has(victim.id)) {
      ev.cancel = true;
      return;
    }
    const attacker = ev.damageSource.damagingEntity;
    if (attacker instanceof Player) {
      const sameTeam = match.teams.some((team) => team.includes(attacker.id) && team.includes(victim.id));
      if (!match.alive.has(attacker.id) || sameTeam) {
        ev.cancel = true;
        return;
      }
      match.lastHit.set(victim.id, attacker.id);
    }
    const hp = victim.getComponent("minecraft:health")?.currentValue ?? 20;
    if (ev.damage >= hp && !holdingTotem(victim)) {
      ev.cancel = true;
      const killer = attacker instanceof Player ? attacker.id : match.lastHit.get(victim.id);
      system.run(() => eliminate(victim.id, killer));
    }
  });

  // Leaving the game counts as losing that fight.
  world.beforeEvents.playerLeave.subscribe(({ player }) => {
    const id = player.id;
    system.run(() => {
      leaveQueue(id);
      eliminate(id, undefined);
    });
  });

  system.runInterval(matchmake, 40);

  // Falling out of the arena eliminates you.
  system.runInterval(() => {
    for (const [id, match] of playerMatch) {
      if (!match.started || match.ended || !match.alive.has(id)) continue;
      const p = world.getEntity(id);
      if (p && p.location.y < match.arena.center.y - 8) eliminate(id, match.lastHit.get(id));
    }
  }, 10);
}

