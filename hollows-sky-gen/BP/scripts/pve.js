// PvE: wave-based mob arena with stronger mobs, bosses and custom loot.
import { BlockVolume, EquipmentSlot, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { PVE, PVE_ARMOR, PVE_BOSS_LOOT, PVE_BOSSES, PVE_LOOT, PVE_MOBS, PVE_SPECIAL_LOOT } from "./config.js";
import { addMoney, money, saveStatsById, statsById } from "./data.js";
import { addTravelBlocker } from "./islands.js";
import { arenaAt, inMatch, leaveQueue, returnPlayer } from "./pvp.js";

const overworld = () => world.getDimension("overworld");
const A = PVE.arenas;

export const pveArenas = [];
for (let i = 0; i < A.count; i++) {
  pveArenas.push({ id: `pve-${i + 1}`, radius: A.radius, center: { x: A.baseX + i * A.spacing, y: A.y, z: A.baseZ } });
}

export function pveArenaAt(location) {
  return pveArenas.find((a) => Math.abs(location.x - a.center.x) <= a.radius + 6 && Math.abs(location.z - a.center.z) <= a.radius + 6);
}

function buildArena(arena) {
  const dim = overworld();
  const { x, y, z } = arena.center;
  const r = arena.radius;
  if (!dim.getBlock(arena.center)) return false;
  if (world.getDynamicProperty(`hsg:arena:${arena.id}`)) return true;
  const fill = (x1, y1, z1, x2, y2, z2, block) => dim.fillBlocks(new BlockVolume({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }), block);
  fill(x - r, y - 1, z - r, x + r, y - 1, z + r, "minecraft:deepslate");
  fill(x - r, y, z - r, x + r, y, z + r, "minecraft:deepslate_tiles");
  fill(x - r, y + 1, z - r, x + r, y + 5, z - r, "minecraft:glass");
  fill(x - r, y + 1, z + r, x + r, y + 5, z + r, "minecraft:glass");
  fill(x - r, y + 1, z - r, x - r, y + 5, z + r, "minecraft:glass");
  fill(x + r, y + 1, z - r, x + r, y + 5, z + r, "minecraft:glass");
  for (const [dx, dz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) fill(x + dx, y + 1, z + dz, x + dx, y + 2, z + dz, "minecraft:cracked_deepslate_bricks");
  world.setDynamicProperty(`hsg:arena:${arena.id}`, true);
  return true;
}

// ---------- Lobbies: wait a few seconds so friends can join ----------

/** leader id -> { leader, members: [ids], startsAt } */
const lobbies = new Map();
/** player id -> run */
const playerRun = new Map();
/** mob entity id -> { run, type, boss } */
const runMobs = new Map();
const busy = new Set();

export const inRun = (player) => playerRun.has(player.id);
export const lobbyOf = (player) => [...lobbies.values()].find((l) => l.members.includes(player.id));
export const openLobbies = () => [...lobbies.values()];

export function createLobby(player) {
  if (inMatch(player) || inRun(player)) return player.sendMessage("§cYou're already in a fight.");
  leaveLobby(player);
  leaveQueue(player);
  lobbies.set(player.id, { leader: player.name, leaderId: player.id, members: [player.id], startsAt: system.currentTick + PVE.lobbySeconds * 20 });
  world.sendMessage(`§2${player.name} is starting a PvE run! Talk to the PvE Bot within ${PVE.lobbySeconds} seconds to join.`);
}

export function joinLobby(player, leaderId) {
  const lobby = lobbies.get(leaderId);
  if (!lobby) return player.sendMessage("§cThat run already started.");
  if (inMatch(player) || inRun(player)) return player.sendMessage("§cYou're already in a fight.");
  if (lobby.members.length >= PVE.maxPlayers) return player.sendMessage("§cThat run is full.");
  leaveLobby(player);
  leaveQueue(player);
  lobby.members.push(player.id);
  player.sendMessage(`§aYou joined ${lobby.leader}'s run.`);
}

export function leaveLobby(player) {
  for (const [id, lobby] of lobbies) {
    lobby.members = lobby.members.filter((m) => m !== player.id);
    if (lobby.members.length === 0) lobbies.delete(id);
  }
}

function tickLobbies() {
  const online = new Map(world.getAllPlayers().map((p) => [p.id, p]));
  for (const [id, lobby] of lobbies) {
    lobby.members = lobby.members.filter((m) => online.has(m));
    if (lobby.members.length === 0) {
      lobbies.delete(id);
      continue;
    }
    const left = Math.ceil((lobby.startsAt - system.currentTick) / 20);
    if (left > 0) {
      for (const m of lobby.members) online.get(m)?.onScreenDisplay.setActionBar(`§2PvE run starts in ${left}s §7- ${lobby.members.length}/${PVE.maxPlayers} players`);
      continue;
    }
    const arena = pveArenas.find((a) => !busy.has(a.id));
    if (!arena) {
      for (const m of lobby.members) online.get(m)?.onScreenDisplay.setActionBar("§eWaiting for a free PvE arena...");
      continue;
    }
    lobbies.delete(id);
    startRun(arena, lobby.members.map((m) => online.get(m)));
  }
}

// ---------- Runs ----------

function heal(player) {
  player.getComponent("minecraft:health")?.resetToMaxValue();
  player.extinguishFire();
  player.addEffect("saturation", 5, { amplifier: 10, showParticles: false });
}

const runPlayers = (run) => run.members.map((id) => world.getEntity(id)).filter((p) => p instanceof Player && p.isValid);
const tell = (run, text) => runPlayers(run).forEach((p) => p.sendMessage(text));
const title = (run, text, subtitle = "") =>
  runPlayers(run).forEach((p) => p.onScreenDisplay.setTitle(text, { subtitle, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 }));

function spot(run, i) {
  const c = run.arena.center;
  return { x: c.x + (i % 2 === 0 ? -1.5 : 2.5), y: c.y + 1, z: c.z + (i < 2 ? -1.5 : 2.5) };
}

function startRun(arena, players) {
  busy.add(arena.id);
  const run = { arena, members: players.map((p) => p.id), alive: new Set(), knocked: new Set(), mobs: new Set(), wave: 0, state: "starting" };
  for (const p of players) {
    playerRun.set(p.id, run);
    const l = p.location;
    p.setDynamicProperty("hsg:return", JSON.stringify({ x: l.x, y: l.y, z: l.z, dim: p.dimension.id, mode: p.getGameMode() }));
    p.addEffect("slow_falling", 300, { showParticles: false });
    p.teleport({ x: arena.center.x + 0.5, y: arena.center.y + 6, z: arena.center.z + 0.5 }, { dimension: overworld() });
  }
  tell(run, `§2PvE run started: ${players.map((p) => p.name).join(", ")}`);

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
      tell(run, "§cThe arena didn't load. Run cancelled.");
      return finishRun(run);
    }
    runPlayers(run).forEach((p, i) => {
      p.teleport(spot(run, i), { dimension: overworld() });
      p.removeEffect("slow_falling");
      heal(p);
    });
    title(run, "§2Get ready!", "§7Wave 1 starts in 5 seconds");
    system.runTimeout(() => nextWave(run), 100);
  }, 5);
}

function nextWave(run) {
  if (run.state === "ended") return;
  run.wave++;
  // Anyone knocked out last wave comes back for the new one.
  runPlayers(run).forEach((p, i) => {
    if (run.knocked.has(p.id)) {
      p.setGameMode(GameMode.Survival);
      p.teleport(spot(run, i), { dimension: overworld() });
    }
    heal(p);
    run.alive.add(p.id);
  });
  run.knocked.clear();
  run.state = "fighting";

  const boss = run.wave % PVE.bossEvery === 0;
  title(run, boss ? `§4§lBOSS WAVE ${run.wave}` : `§c§lWave ${run.wave}`, boss ? `§c${bossFor(run.wave).name} is here!` : "");
  for (const p of runPlayers(run)) p.playSound(boss ? "mob.wither.spawn" : "raid.horn", { volume: boss ? 0.5 : 1 });

  const players = run.members.length;
  const count = Math.min(30, Math.round((3 + run.wave * 2) * (1 + 0.5 * (players - 1)) * (boss ? 0.5 : 1)));
  const pool = PVE_MOBS.filter((m) => run.wave >= m.from);
  for (let i = 0; i < count; i++) spawnMob(run, pool[Math.floor(Math.random() * pool.length)].type, false);
  if (boss) spawnMob(run, bossFor(run.wave).type, true);
}

function bossFor(wave) {
  return PVE_BOSSES[(Math.floor(wave / PVE.bossEvery) - 1) % PVE_BOSSES.length];
}

function spawnMob(run, type, isBoss) {
  const c = run.arena.center;
  const r = run.arena.radius - 3;
  // Spawn around the edge, away from the players in the middle.
  const angle = Math.random() * Math.PI * 2;
  const dist = r * (0.6 + Math.random() * 0.4);
  const where = { x: c.x + 0.5 + Math.cos(angle) * dist, y: c.y + 1, z: c.z + 0.5 + Math.sin(angle) * dist };
  let mob;
  try {
    mob = overworld().spawnEntity(type, where);
  } catch {
    return;
  }
  runMobs.set(mob.id, { run, type, boss: isBoss });
  run.mobs.add(mob.id);
  buffMob(mob, run.wave, isBoss);
  if (isBoss) mob.nameTag = `§4§l${bossFor(run.wave).name}`;
}

/** Stronger mobs on later waves: more health, more damage, armor. */
function buffMob(mob, wave, isBoss) {
  const long = 20 * 60 * 20;
  const effect = (id, amplifier) => {
    if (amplifier >= 0) mob.addEffect(id, long, { amplifier, showParticles: false });
  };
  effect("fire_resistance", 0); // don't burn in daylight
  effect("health_boost", Math.min(isBoss ? wave * 3 : Math.floor(wave / 2) - 1, 60)); // +4 health per level
  effect("strength", Math.min(isBoss ? Math.floor(wave / 3) : Math.floor(wave / 4) - 1, 5));
  effect("resistance", isBoss ? Math.min(Math.floor(wave / 10), 2) : wave >= 15 ? 0 : -1);
  effect("speed", wave >= 10 ? 0 : -1);
  mob.getComponent("minecraft:health")?.resetToMaxValue();

  const armor = [...PVE_ARMOR].reverse().find((a) => wave >= a.from || (isBoss && wave + 5 >= a.from));
  if (!armor) return;
  const pieces = { head: "helmet", chest: "chestplate", legs: "leggings", feet: "boots" };
  for (const [slot, piece] of Object.entries(pieces)) {
    try {
      mob.runCommand(`replaceitem entity @s slot.armor.${slot} 0 ${armor.set}_${piece}`);
    } catch {
      // Some mobs can't wear armor; that's fine.
    }
  }
}

/** Every second: count mobs left, tidy up strays, and end the wave when they're all gone. */
function tickRuns() {
  for (const run of new Set(playerRun.values())) {
    if (run.state !== "fighting") continue;
    for (const id of [...run.mobs]) {
      const mob = world.getEntity(id);
      if (!mob || !mob.isValid) {
        run.mobs.delete(id);
        runMobs.delete(id);
      } else if (mob.location.y < run.arena.center.y - 10 || !pveArenaAt(mob.location)) {
        mob.remove();
        run.mobs.delete(id);
        runMobs.delete(id);
      }
    }
    for (const p of runPlayers(run)) p.onScreenDisplay.setActionBar(`§cWave ${run.wave} §7- ${run.mobs.size} mobs left`);
    if (run.mobs.size === 0) waveCleared(run);
  }
}

function waveCleared(run) {
  run.state = "break";
  const boss = run.wave % PVE.bossEvery === 0;
  const prize = PVE.moneyPerWave * run.wave + (boss ? PVE.bossBonus * (run.wave / PVE.bossEvery) : 0);
  for (const id of run.members) {
    const stats = statsById(id);
    if (!stats) continue;
    stats.bestWave = Math.max(stats.bestWave, run.wave);
    saveStatsById(id);
  }
  for (const p of runPlayers(run)) addMoney(p, prize);
  title(run, `§a§lWave ${run.wave} cleared!`, `§a+${money(prize)} §7- next wave in ${PVE.breakSeconds}s`);
  for (const p of runPlayers(run)) p.playSound("random.levelup");
  system.runTimeout(() => nextWave(run), PVE.breakSeconds * 20);
}

/** A player is knocked out. They come back next wave if their team clears this one. */
function knockOut(id) {
  const run = playerRun.get(id);
  if (!run || run.state === "ended" || !run.alive.has(id)) return;
  run.alive.delete(id);
  run.knocked.add(id);
  const stats = statsById(id);
  if (stats) {
    stats.deaths++;
    saveStatsById(id);
  }
  const p = world.getEntity(id);
  if (p instanceof Player && p.isValid) {
    heal(p);
    p.setGameMode(GameMode.Spectator);
    p.onScreenDisplay.setTitle("§cKnocked out", { subtitle: "§7You're back next wave if your team survives", fadeInDuration: 0, stayDuration: 50, fadeOutDuration: 10 });
  }
  tell(run, `§c${stats?.name} was knocked out!`);
  if (run.alive.size === 0) endRun(run);
}

function endRun(run) {
  run.state = "ended";
  const reached = run.wave - 1;
  for (const id of run.members) {
    const stats = statsById(id);
    if (!stats) continue;
    stats.pveRuns++;
    saveStatsById(id);
  }
  title(run, "§c§lRun over", `§7You cleared ${reached} wave${reached === 1 ? "" : "s"}`);
  tell(run, `§cRun over. Waves cleared: ${reached}.`);
  system.runTimeout(() => finishRun(run), 60);
}

function finishRun(run) {
  run.state = "ended";
  for (const id of run.mobs) {
    world.getEntity(id)?.remove();
    runMobs.delete(id);
  }
  run.mobs.clear();
  for (const id of run.members) {
    playerRun.delete(id);
    const p = world.getEntity(id);
    if (p instanceof Player && p.isValid) returnPlayer(p);
  }
  busy.delete(run.arena.id);
}

/** Leave a run (or a lobby) early. */
export function leaveRun(player) {
  leaveLobby(player);
  const run = playerRun.get(player.id);
  if (!run) return false;
  knockOut(player.id);
  run.members = run.members.filter((m) => m !== player.id);
  run.knocked.delete(player.id);
  playerRun.delete(player.id);
  returnPlayer(player);
  player.sendMessage("§eYou left the PvE run.");
  if (run.state !== "ended" && run.alive.size === 0) endRun(run);
  return true;
}

// ---------- Loot ----------

function roll(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function dropLoot(info, location) {
  const dim = overworld();
  const drop = (id, amount = 1) => {
    try {
      dim.spawnItem(new ItemStack(id, amount), location);
    } catch {
      // Unknown item in this version; skip it.
    }
  };
  const wave = info.run.wave;
  for (const l of PVE_LOOT) if (wave >= l.from && Math.random() < l.chance) drop(l.item, roll(l.min, l.max));
  for (const l of PVE_SPECIAL_LOOT) if (l.mob === info.type && wave >= l.from && Math.random() < l.chance) drop(l.item);
  if (info.boss) {
    drop("minecraft:diamond", 3);
    drop(PVE_BOSS_LOOT[Math.floor(Math.random() * PVE_BOSS_LOOT.length)]);
  }
}

// ---------- Events ----------

const TOTEM = "minecraft:totem_of_undying";

export function startPve() {
  addTravelBlocker((player) => (playerRun.get(player.id)?.state !== undefined && playerRun.get(player.id).state !== "ended" ? "§cLeave the PvE run first (Sky Menu or /leave)." : ""));

  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    const info = runMobs.get(deadEntity.id);
    if (!info) return;
    runMobs.delete(deadEntity.id);
    info.run.mobs.delete(deadEntity.id);
    let where;
    try {
      where = deadEntity.location;
    } catch {
      where = { ...info.run.arena.center, y: info.run.arena.center.y + 1 };
    }
    dropLoot(info, where);
  });

  // In a run: no hurting teammates, and a killing hit knocks you out instead.
  world.beforeEvents.entityHurt.subscribe((ev) => {
    const victim = ev.hurtEntity;
    if (!(victim instanceof Player)) return;
    const run = playerRun.get(victim.id);
    if (!run) return;
    if (run.state !== "fighting" || !run.alive.has(victim.id) || ev.damageSource.damagingEntity instanceof Player) {
      ev.cancel = true;
      return;
    }
    const hp = victim.getComponent("minecraft:health")?.currentValue ?? 20;
    const eq = victim.getComponent("minecraft:equippable");
    const totem = eq?.getEquipment(EquipmentSlot.Offhand)?.typeId === TOTEM || eq?.getEquipment(EquipmentSlot.Mainhand)?.typeId === TOTEM;
    if (ev.damage >= hp && !totem) {
      ev.cancel = true;
      system.run(() => knockOut(victim.id));
    }
  });

  // Creepers and TNT can't blow holes in any arena.
  world.beforeEvents.explosion.subscribe((ev) => {
    const blocks = ev.getImpactedBlocks();
    const keep = blocks.filter((b) => !pveArenaAt(b.location) && !arenaAt(b.location));
    if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
  });

  world.beforeEvents.playerLeave.subscribe(({ player }) => {
    const id = player.id;
    system.run(() => {
      const run = playerRun.get(id);
      if (!run) return;
      knockOut(id);
      run.members = run.members.filter((m) => m !== id);
      run.knocked.delete(id);
      playerRun.delete(id);
      if (run.state !== "ended" && run.alive.size === 0) endRun(run);
    });
  });

  system.runInterval(tickLobbies, 20);
  system.runInterval(tickRuns, 20);
}
