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
import { JOIN_DELAY_SECONDS, PLOTS } from "./config.js";
import { firstFreePlot, getHub, getPlot, getStats, isNewPlayer, plotAt, saveStats } from "./data.js";
import { claimPlot, plotForGenerator, rebuildGenIndex, regenerate, sendHome, sendToHub, sendToPlot, startFallCatcher } from "./islands.js";
import { startLeaderboards } from "./leaderboard.js";
import { giveItem, isAdmin, makePickaxe, moneyBotMenu, skyMenu, upgradeBotMenu } from "./menus.js";

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
    { name: "hsg:skymenu", description: "Open the Sky Menu.", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (player) => skyMenu(player)
  );
});

// ---------- Startup ----------

world.afterEvents.worldLoad.subscribe(() => {
  rebuildGenIndex();
  startFallCatcher();
  startLeaderboards();

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

  // The very first person to ever join (the world's host) becomes the admin.
  if (!world.getDynamicProperty("hsg:hasAdmin")) {
    world.setDynamicProperty("hsg:hasAdmin", true);
    player.addTag("hsg_admin");
    player.sendMessage("§eYou're the admin. Open the Sky Menu > Admin Tools and build the hub.");
  }

  if (firstTime) {
    giveItem(player, new ItemStack("hsg:sky_menu"));
    giveItem(player, makePickaxe(0));
  }

  if (!stats.plot) {
    const n = firstFreePlot();
    if (n) {
      claimPlot(player, n);
      player.sendMessage(`§a${player.name} has been given Plot ${n}!`);
    } else {
      player.sendMessage("§cAll 100 islands are taken. Ask an admin to free one up.");
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
});
