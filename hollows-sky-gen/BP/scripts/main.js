// Hollow's Sky Gen - Part 1: islands, generators, money, upgrades, stats and leaderboards.
import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { JOIN_DELAY_SECONDS, PLOTS, WELCOME_GIFT } from "./config.js";
import { remindRequests } from "./friends.js";
import { addMoney, firstFreePlot, getHub, getPlot, getStats, isNewPlayer, loadPlots, money, plotAt, saveStats, updateNameTag } from "./data.js";
import { claimPlot, plotForGenerator, rebuildGenIndex, regenerate, sendHome, sendToHub, sendToPlot, startFallCatcher } from "./islands.js";
import { startLeaderboards } from "./leaderboard.js";
import { giveItem, isAdmin, makePickaxe, moneyBotMenu, pveBotMenu, pvpBotMenu, pvpShopMenu, skyMenu, upgradeBotMenu } from "./menus.js";
import { leaveRun, pveArenaAt, startPve } from "./pve.js";
import { arenaAt, leaveQueue, needsReturn, queueOf, returnPlayer, startPvp } from "./pvp.js";

// ---------- Slash commands: /plot, /hub, /skymenu ----------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  const reg = (command, run) =>
    customCommandRegistry.registerCommand(command, (origin, ...args) => {
      const player = origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Only players can use this." };
      system.run(() => run(player, ...args));
      return { status: CustomCommandStatus.Success };
    });

  reg(
    {
      name: "hsg:plot",
      description: "Go to your island, or /plot <number> to visit someone's island.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "id", type: CustomCommandParamType.Integer }],
    },
    (player, id) => {
      if (id === undefined) return sendHome(player);
      if (id < 1 || id > PLOTS.count) return player.sendMessage(`§cPlot IDs go from 1 to ${PLOTS.count}.`);
      const plot = getPlot(id);
      if (!plot.owner) return player.sendMessage(`§cPlot ${id} doesn't belong to anyone yet.`);
      sendToPlot(player, id, plot.owner === player.id);
    }
  );
  reg(
    { name: "hsg:hub", description: "Go to the hub with the bots.", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (player) => sendToHub(player)
  );
  reg(
    { name: "hsg:leave", description: "Leave a PvE run or a PvP queue.", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (player) => {
      if (leaveRun(player)) return;
      if (queueOf(player)) {
        leaveQueue(player);
        return player.sendMessage("§eYou left the PvP queue.");
      }
      player.sendMessage("§7You're not in a run or a queue.");
    }
  );
  reg(
    { name: "hsg:skymenu", description: "Open the Sky Menu.", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (player) => skyMenu(player)
  );
});

// ---------- Startup ----------

world.afterEvents.worldLoad.subscribe(() => {
  loadPlots();
  rebuildGenIndex();
  startFallCatcher();
  startLeaderboards();
  startPvp();
  startPve();

  // Time played: +1 minute for everyone online.
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      getStats(player).minutes++;
      saveStats(player);
    }
  }, 1200);
});

// ---------- Joining ----------

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  const firstTime = isNewPlayer(player);
  const stats = getStats(player);
  saveStats(player);
  updateNameTag(player);
  // Left the game during a PvP match: undo spectator mode first.
  if (needsReturn(player)) returnPlayer(player);

  // The very first person to ever join (the world's host) becomes the admin.
  if (!world.getDynamicProperty("hsg:hasAdmin")) {
    world.setDynamicProperty("hsg:hasAdmin", true);
    player.addTag("hsg_admin");
    player.sendMessage("§eYou're the admin. Admin Tools are in the Sky Menu. Type /hub to see the hub.");
  }

  if (firstTime) {
    giveItem(player, new ItemStack("hsg:sky_menu"));
    giveItem(player, makePickaxe(0));
    player.sendMessage(`§6§lWelcome to Hollow's Sky Gen! §r§eHere's ${money(WELCOME_GIFT)} to get you started.`);
  }
  // New players get the welcome gift. Adding $0 still checks the first $100 bonus for older players.
  addMoney(player, firstTime ? WELCOME_GIFT : 0);
  remindRequests(player);

  if (!stats.plot) {
    const n = firstFreePlot();
    if (n) {
      claimPlot(player, n);
      player.sendMessage(`§a${player.name} has been given Plot ${n}!`);
    } else {
      player.sendMessage(`§cAll ${PLOTS.count} islands are taken. Ask an admin to free one up.`);
    }
  }

  // Countdown, then off to their island.
  let left = JOIN_DELAY_SECONDS;
  const job = system.runInterval(() => {
    if (!player.isValid) return system.clearRun(job);
    if (left > 0) {
      player.onScreenDisplay.setTitle("§bHollow's Sky Gen", {
        subtitle: getStats(player).plot ? `§7Going to your island in ${left}...` : `§7Welcome!`,
        fadeInDuration: 0,
        stayDuration: 25,
        fadeOutDuration: 0,
      });
      left--;
      return;
    }
    system.clearRun(job);
    if (getStats(player).plot) sendHome(player);
    else if (getHub()) sendToHub(player);
  }, 20);
});

// ---------- Mining ----------

world.afterEvents.playerBreakBlock.subscribe(({ player, block }) => {
  const stats = getStats(player);
  stats.mined++;
  saveStats(player);
  const n = plotForGenerator(block.location);
  if (n) regenerate(n, block.location);
});

/** True if the player isn't allowed to change blocks here. */
function isProtected(player, location) {
  if (isAdmin(player)) return false;
  const hub = getHub();
  if (hub && Math.abs(location.x - hub.x) <= 30 && Math.abs(location.z - hub.z) <= 30) return true;
  if (arenaAt(location) || pveArenaAt(location)) return true;
  const n = plotAt(location);
  return n !== 0 && getPlot(n).owner !== player.id;
}

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (!isProtected(ev.player, ev.block.location)) return;
  ev.cancel = true;
  system.run(() => ev.player.sendMessage("§cThis isn't your island."));
});

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!isProtected(ev.player, ev.block.location)) return;
  ev.cancel = true;
  if (ev.isFirstEvent) system.run(() => ev.player.sendMessage("§cThis isn't your island."));
});

// ---------- Kills, deaths, mob kills ----------

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (deadEntity instanceof Player) {
    getStats(deadEntity).deaths++;
    saveStats(deadEntity);
    if (killer instanceof Player && killer.id !== deadEntity.id) {
      getStats(killer).kills++;
      saveStats(killer);
    }
  } else if (killer instanceof Player) {
    getStats(killer).mobs++;
    saveStats(killer);
  }
});

// ---------- Sky Menu item and bots ----------

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack.typeId === "hsg:sky_menu") skyMenu(source);
});

world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (target.typeId !== "hsg:bot") return;
  const role = target.getDynamicProperty("role");
  if (role === "money") moneyBotMenu(player);
  else if (role === "upgrade") upgradeBotMenu(player);
  else if (role === "pvp") pvpBotMenu(player);
  else if (role === "shop") pvpShopMenu(player);
  else if (role === "pve") pveBotMenu(player);
});
