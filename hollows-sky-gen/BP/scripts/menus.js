// All the pop-up screens: Sky Menu, Money Bot, Upgrade Bot, stats and admin tools.
import { EnchantmentTypes, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { GEN_LEVELS, GEN_SLOT_COST, GEN_SPOTS, PICKAXES, PLOTS, PVE, PVP_PRIZE, PVP_SHOP, RANKS, SELL_PRICES } from "./config.js";
import { addMoney, allPlayers, getPlot, getStats, kdr, money, rankName, resetPlot, savePlot, saveStats, statsById, trySpend } from "./data.js";
import { inMatch, joinQueue, leaveQueue, QUEUES, queueCount, queueOf } from "./pvp.js";
import { friendsMenu } from "./friends.js";
import { createLobby, inRun, joinLobby, leaveLobby, leaveRun, lobbyOf, openLobbies } from "./pve.js";
import {
  buildHub,
  movePlayerToPlot,
  preparePlot,
  rebuildGenIndex,
  refreshGenerators,
  sendHome,
  sendToHub,
  sendToPlot,
  spawnBot,
} from "./islands.js";
import { BOARDS, boardText, timePlayed } from "./leaderboard.js";

export const isAdmin = (player) => player.hasTag("hsg_admin");

/**
 * Shows a menu. buttons = [{ text, run }]. Retries if the player is busy
 * (for example chat is open), which would otherwise close it straight away.
 */
export function menu(player, title, body, buttons, tries = 0) {
  const form = new ActionFormData().title(title).body(body);
  for (const b of buttons) form.button(b.text);
  form.show(player).then((res) => {
    if (res.canceled) {
      if (res.cancelationReason === FormCancelationReason.UserBusy && tries < 10) {
        system.runTimeout(() => menu(player, title, body, buttons, tries + 1), 10);
      }
      return;
    }
    buttons[res.selection]?.run();
  });
}

// ---------- Sky Menu (the item every player gets) ----------

export function skyMenu(player) {
  const stats = getStats(player);
  const buttons = [
    { text: "§2My Island", run: () => sendHome(player) },
    { text: "§bFriends" + (stats.requests.length ? ` §c(${stats.requests.length} new)` : ""), run: () => friendsMenu(player) },
    { text: "§9Visit an Island", run: () => visitMenu(player) },
    { text: "§6Go to Hub", run: () => sendToHub(player) },
    { text: "§3My Stats", run: () => statsMenu(player, stats) },
    { text: "§5Leaderboards", run: () => leaderboardMenu(player) },
    { text: "§8Look at Players", run: () => playersMenu(player) },
  ];
  if (inRun(player)) buttons.unshift({ text: "§cLeave PvE run", run: () => leaveRun(player) });
  if (isAdmin(player)) buttons.push({ text: "§cAdmin Tools", run: () => adminMenu(player) });
  menu(player, "§l§bHollow's Sky Gen", `Money: §a${money(stats.money)}§r\nIsland: §e${stats.plot ? "Plot " + stats.plot : "none"}`, buttons);
}

function visitMenu(player) {
  if (!isAdmin(player)) return friendIslandsMenu(player);
  const buttons = [];
  for (let start = 1; start <= PLOTS.count; start += 50) {
    const end = Math.min(start + 49, PLOTS.count);
    let taken = 0;
    for (let n = start; n <= end; n++) if (getPlot(n).owner) taken++;
    if (taken) buttons.push({ text: `Islands ${start} - ${end}\n§8${taken} taken`, run: () => visitPage(player, start, end) });
  }
  menu(player, "Visit an Island", buttons.length ? "Pick a group. You can also type /plot <number>." : "No islands yet.", buttons);
}

/** Normal players can only visit their friends' islands. */
function friendIslandsMenu(player) {
  const buttons = getStats(player)
    .friends.map((id) => statsById(id))
    .filter((s) => s?.plot)
    .map((s) => ({ text: `${s.name}\n§8Plot ${s.plot}`, run: () => sendToPlot(player, s.plot, false) }));
  menu(player, "Visit an Island", buttons.length ? "You can visit your friends' islands." : "You can only visit friends' islands. Add friends in Sky Menu > Friends.", [
    ...buttons,
    { text: "Back", run: () => skyMenu(player) },
  ]);
}

function visitPage(player, start, end) {
  const buttons = [];
  for (let n = start; n <= end; n++) {
    const plot = getPlot(n);
    if (plot.owner) buttons.push({ text: `Plot ${n}\n§8${plot.ownerName}`, run: () => sendToPlot(player, n, plot.owner === player.id) });
  }
  menu(player, `Islands ${start} - ${end}`, "Pick an island.", buttons);
}

export function statsText(stats) {
  return [
    `§l${stats.name}§r`,
    `Island: §e${stats.plot ? "Plot " + stats.plot : "none"}`,
    `§rMoney: §a${money(stats.money)}`,
    `§rKills: §c${stats.kills}`,
    `§rDeaths: §7${stats.deaths}`,
    `§rK/D Ratio: §e${kdr(stats).toFixed(2)}`,
    `§rRank: ${rankName(stats)} §7(${stats.rating} rating, ${stats.rankedGames} ranked games)`,
    `§rPvP Wins: §a${stats.wins} §r Losses: §c${stats.losses}`,
    `§rHighest PvE Wave: §2${stats.bestWave} §r(${stats.pveRuns} runs)`,
    `§rMobs Killed: §2${stats.mobs}`,
    `§rBlocks Mined: §6${stats.mined}`,
    `§rTime Played: §b${timePlayed(stats.minutes)}`,
    `§rPickaxe: §d${PICKAXES[stats.pick].name}`,
  ].join("\n");
}

function statsMenu(player, stats) {
  menu(player, "Stats", statsText(stats), [{ text: "Back", run: () => skyMenu(player) }]);
}

function leaderboardMenu(player) {
  menu(
    player,
    "Leaderboards",
    "Top 10 players. These also show on the side of your screen and above every island.",
    BOARDS.map((board) => ({
      text: board.title,
      run: () => menu(player, board.title, boardText(board), [{ text: "Back", run: () => leaderboardMenu(player) }]),
    }))
  );
}

function playersMenu(player) {
  const list = allPlayers().sort((a, b) => a.stats.name.localeCompare(b.stats.name));
  menu(
    player,
    "Players",
    "Pick a player to see their stats.",
    list.map(({ id, stats }) => ({
      text: stats.name,
      run: () => {
        const fresh = statsById(id) ?? stats;
        menu(player, fresh.name, statsText(fresh), [
          ...(fresh.plot && (fresh.friends.includes(player.id) || isAdmin(player))
            ? [{ text: "Visit their island", run: () => sendToPlot(player, fresh.plot, fresh.plot === getStats(player).plot) }]
            : []),
          { text: "Back", run: () => playersMenu(player) },
        ]);
      },
    }))
  );
}

// ---------- Money Bot ----------

function itemName(typeId) {
  return typeId
    .replace("minecraft:", "")
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function moneyBotMenu(player) {
  const stats = getStats(player);
  const prices = Object.entries(SELL_PRICES)
    .map(([id, price]) => `${itemName(id)}: §a${money(price)}§r`)
    .join("\n");
  menu(player, "§a§lMoney Bot", `You have §a${money(stats.money)}§r.\n\nI pay (each):\n${prices}`, [
    { text: "§2Sell everything I can", run: () => sellAll(player) },
    { text: "Close", run: () => {} },
  ]);
}

function sellAll(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  let total = 0;
  let count = 0;
  for (let i = 0; i < inv.size; i++) {
    const item = inv.getItem(i);
    const price = item && SELL_PRICES[item.typeId];
    if (!price) continue;
    total += price * item.amount;
    count += item.amount;
    inv.setItem(i);
  }
  if (count === 0) return player.sendMessage("§cYou don't have anything I buy. Mine your generators!");
  addMoney(player, total);
  player.sendMessage(`§aSold ${count} items for ${money(total)}. You now have ${money(getStats(player).money)}.`);
  player.playSound("random.orb");
}

// ---------- Upgrade Bot ----------

const PICK_LORE = "§bSky Pickaxe";

export function makePickaxe(tier) {
  const info = PICKAXES[tier];
  let item;
  try {
    item = new ItemStack(info.item);
  } catch {
    item = new ItemStack(info.fallback ?? "minecraft:stone_pickaxe");
  }
  item.nameTag = `§b${info.name}`;
  item.setLore([PICK_LORE, `§7Tier ${tier + 1} of ${PICKAXES.length}`]);
  item.keepOnDeath = true;
  const ench = item.getComponent("minecraft:enchantable");
  for (const [id, level] of info.enchants) {
    try {
      const type = EnchantmentTypes.get(String(id));
      if (type) ench?.addEnchantment({ type, level: Number(level) });
    } catch {
      // Enchantment doesn't fit this item; skip it.
    }
  }
  return item;
}

function removeSkyPickaxes(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  for (let i = 0; i < inv.size; i++) {
    if (inv.getItem(i)?.getLore()[0] === PICK_LORE) inv.setItem(i);
  }
}

function hasSkyPickaxe(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return false;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.getLore()[0] === PICK_LORE) return true;
  return false;
}

export function giveItem(player, item) {
  const left = player.getComponent("minecraft:inventory")?.container?.addItem(item);
  if (left) player.dimension.spawnItem(left, player.location);
}

export function upgradeBotMenu(player) {
  const stats = getStats(player);
  const plot = stats.plot ? getPlot(stats.plot) : undefined;
  const nextPick = PICKAXES[stats.pick + 1];
  const nextGen = plot ? GEN_LEVELS[plot.level + 1] : undefined;
  const slotCost = plot ? GEN_SLOT_COST[plot.gens] : undefined;

  const lines = [`You have §a${money(stats.money)}§r.`, `Pickaxe: §d${PICKAXES[stats.pick].name}`];
  if (plot) lines.push(`§rGenerators: §e${plot.gens}/${GEN_SPOTS.length}§r making §e${GEN_LEVELS[plot.level].name}`);

  const buttons = [];
  if (nextPick) buttons.push({ text: `Upgrade pickaxe\n§8${nextPick.name} - ${money(nextPick.cost)}`, run: () => buyPickaxe(player) });
  if (plot && nextGen) buttons.push({ text: `Upgrade generators\n§8${nextGen.name} - ${money(nextGen.cost)}`, run: () => buyGenLevel(player) });
  if (plot && slotCost !== undefined) buttons.push({ text: `Buy another generator\n§8${money(slotCost)}`, run: () => buyGenSlot(player) });
  buttons.push({ text: "Get my pickaxe back\n§8Free, if you lost it", run: () => pickaxeBack(player) });
  buttons.push({ text: "Close", run: () => {} });
  menu(player, "§b§lUpgrade Bot", lines.join("\n"), buttons);
}

function buyPickaxe(player) {
  const stats = getStats(player);
  const next = PICKAXES[stats.pick + 1];
  if (!next) return;
  if (!trySpend(player, next.cost)) return player.sendMessage(`§cYou need ${money(next.cost)} for the ${next.name}.`);
  stats.pick++;
  saveStats(player);
  removeSkyPickaxes(player);
  giveItem(player, makePickaxe(stats.pick));
  player.sendMessage(`§aUpgraded to the ${next.name}!`);
  player.playSound("random.levelup");
}

function pickaxeBack(player) {
  if (hasSkyPickaxe(player)) return player.sendMessage("§eYou already have your pickaxe.");
  giveItem(player, makePickaxe(getStats(player).pick));
  player.sendMessage("§aHere's your pickaxe back.");
}

function buyGenLevel(player) {
  const n = getStats(player).plot;
  const plot = getPlot(n);
  const next = GEN_LEVELS[plot.level + 1];
  if (!next) return;
  if (!trySpend(player, next.cost)) return player.sendMessage(`§cYou need ${money(next.cost)} to upgrade to ${next.name}.`);
  plot.level++;
  savePlot(n);
  try {
    refreshGenerators(n);
  } catch {
    // Island not loaded; it updates when you go back.
  }
  player.sendMessage(`§aYour generators now make ${next.name}!`);
  player.playSound("random.levelup");
}

function buyGenSlot(player) {
  const n = getStats(player).plot;
  const plot = getPlot(n);
  const cost = GEN_SLOT_COST[plot.gens];
  if (cost === undefined) return;
  if (!trySpend(player, cost)) return player.sendMessage(`§cYou need ${money(cost)} for another generator.`);
  plot.gens++;
  savePlot(n);
  rebuildGenIndex();
  try {
    preparePlot(n);
  } catch {
    // Placed next time the island loads.
  }
  player.sendMessage(`§aNew generator added to your island! You have ${plot.gens}.`);
  player.playSound("random.levelup");
}

// ---------- Admin tools ----------

function adminMenu(player) {
  menu(player, "§cAdmin Tools", "Only players with the hsg_admin tag see this.", [
    { text: "Build the hub here\n§8Island + both bots", run: () => buildHub(player) },
    { text: "Spawn Money Bot here", run: () => spawnBot("money", player.location) },
    { text: "Spawn Upgrade Bot here", run: () => spawnBot("upgrade", player.location) },
    { text: "Spawn PvP Bot here", run: () => spawnBot("pvp", player.location) },
    { text: "Spawn PvP Shop here", run: () => spawnBot("shop", player.location) },
    { text: "Spawn PvE Bot here", run: () => spawnBot("pve", player.location) },
    { text: "Remove nearest bot\n§8Hub bots come back by themselves", run: () => removeNearestBot(player) },
    { text: "Move a plot to here", run: () => movePlotMenu(player) },
    { text: "Put a player on a different plot", run: () => setPlotMenu(player) },
    { text: "Free up a plot", run: () => freePlotMenu(player) },
    { text: "§9Spawn a blue axolotl", run: () => spawnBlueAxolotl(player) },
    { text: "Give me $1,000\n§8For testing", run: () => addMoney(player, 1000) },
    { text: "Back", run: () => skyMenu(player) },
  ]);
}

/**
 * Blue is the rare axolotl. Minecraft only makes it for babies born without a
 * color, so spawn it as a newborn and then grow it up.
 */
function spawnBlueAxolotl(player) {
  const axolotl = player.dimension.spawnEntity("minecraft:axolotl", player.location, {
    spawnEvent: "minecraft:entity_born",
    initialPersistence: true,
  });
  system.runTimeout(() => {
    if (axolotl.isValid) axolotl.triggerEvent("minecraft:ageable_grow_up");
  }, 2);
  player.sendMessage("§9Blue axolotl spawned! Put it in water, or it dries out on land.");
}

function removeNearestBot(player) {
  const near = player.dimension.getEntities({ location: player.location, maxDistance: 6, closest: 1, families: ["hsg_bot"] });
  if (near.length === 0) return player.sendMessage("§cNo bot or leaderboard within 6 blocks.");
  near[0].remove();
  player.sendMessage("§aRemoved.");
}

function movePlotMenu(player) {
  const buttons = [];
  for (let start = 1; start <= PLOTS.count; start += 50) {
    const end = Math.min(start + 49, PLOTS.count);
    buttons.push({ text: `Plots ${start} - ${end}`, run: () => movePlotPage(player, start, end) });
  }
  menu(player, "Move a plot", "Pick which plots to choose from.", buttons);
}

function movePlotPage(player, start, end) {
  const buttons = [];
  for (let n = start; n <= end; n++) {
    const plot = getPlot(n);
    buttons.push({
      text: `Plot ${n}\n§8${plot.owner ? plot.ownerName : "empty"}`,
      run: () => {
        const l = player.location;
        Object.assign(plot, { x: Math.floor(l.x), y: Math.floor(l.y) - 1, z: Math.floor(l.z), built: false });
        savePlot(n);
        rebuildGenIndex();
        preparePlot(n);
        player.sendMessage(`§aPlot ${n} is now here.`);
      },
    });
  }
  menu(player, "Move a plot", "Its island will be built under where you're standing. The old island stays where it was.", buttons);
}

function setPlotMenu(admin) {
  const list = allPlayers().sort((a, b) => a.stats.name.localeCompare(b.stats.name));
  menu(
    admin,
    "Change a player's plot",
    "Pick the player to move.",
    list.map(({ id, stats }) => ({
      text: `${stats.name}\n§8${stats.plot ? "Plot " + stats.plot : "no plot"}`,
      run: () => setPlotGroups(admin, id, stats.name),
    }))
  );
}

function setPlotGroups(admin, id, name) {
  const buttons = [];
  for (let start = 1; start <= PLOTS.count; start += 50) {
    const end = Math.min(start + 49, PLOTS.count);
    buttons.push({ text: `Plots ${start} - ${end}`, run: () => setPlotPage(admin, id, name, start, end) });
  }
  menu(admin, `Move ${name}`, "Pick which plots to choose from.", buttons);
}

function setPlotPage(admin, id, name, start, end) {
  const buttons = [];
  for (let n = start; n <= end; n++) {
    const plot = getPlot(n);
    buttons.push({
      text: `Plot ${n}\n§8${plot.owner ? (plot.owner === id ? "their plot now" : plot.ownerName + " (swap)") : "empty"}`,
      run: () => admin.sendMessage(movePlayerToPlot(id, n)),
    });
  }
  menu(
    admin,
    `Move ${name}`,
    "Their generator upgrades move with them. If the plot belongs to someone, the two players swap plots.",
    buttons
  );
}

function freePlotMenu(player) {
  const buttons = [];
  for (let n = 1; n <= PLOTS.count; n++) {
    const plot = getPlot(n);
    if (!plot.owner) continue;
    buttons.push({
      text: `Plot ${n}\n§8${plot.ownerName}`,
      run: () => {
        const owner = statsById(plot.owner);
        if (owner) {
          owner.plot = 0;
          world.setDynamicProperty(`hsg:p:${plot.owner}`, JSON.stringify(owner));
        }
        resetPlot(n);
        rebuildGenIndex();
        player.sendMessage(`§aPlot ${n} is free. Its island stays for the next owner.`);
      },
    });
  }
  menu(player, "Free up a plot", buttons.length ? "The owner loses the plot. The island stays for the next player." : "No plots are taken.", buttons);
}

// ---------- PvP Bot ----------

export function pvpBotMenu(player) {
  const stats = getStats(player);
  if (inMatch(player)) return player.sendMessage("§cYou're already in a match.");
  const current = queueOf(player);
  const ranks = RANKS.map((r) => `${r.color}${r.name}§r ${r.min}+`).join("  ");
  const body = [
    `Your rank: ${rankName(stats)}§r (${stats.rating} rating)`,
    `Wins: §a${stats.wins}§r  Losses: §c${stats.losses}`,
    "",
    `§lCasual§r: fight anyone with whatever gear you have. Win ${money(PVP_PRIZE.casual)}.`,
    `§lRanked§r: you're matched with players near your rating. Win to rank up, lose and you drop. Win ${money(PVP_PRIZE.ranked)}.`,
    "",
    `Ranks: ${ranks}`,
    "",
    "You keep all your items. Afterwards you go back where you were.",
  ].join("\n");
  const buttons = Object.entries(QUEUES).map(([key, q]) => ({
    text: `${current === key ? "§2> " : ""}${q.name}\n§8${queueCount(key)} waiting`,
    run: () => joinQueue(player, key),
  }));
  if (current) buttons.push({ text: "§cLeave the queue", run: () => (leaveQueue(player), player.sendMessage("§eYou left the queue.")) });
  buttons.push({ text: `PvP Settings\n§8Fight against: ${PVP_MODES[stats.pvpMode]}`, run: () => pvpSettingsMenu(player) });
  buttons.push({ text: "Close", run: () => {} });
  menu(player, "§c§lPvP Bot", body, buttons);
}

// ---------- PvP Shop ----------

export function pvpShopMenu(player) {
  const stats = getStats(player);
  menu(
    player,
    "§d§lPvP Shop",
    `You have §a${money(stats.money)}§r.`,
    [
      ...PVP_SHOP.map((entry) => ({
        text: `${entry.name}\n§8${money(entry.cost)}`,
        run: () => {
          if (!trySpend(player, entry.cost)) return player.sendMessage(`§cYou need ${money(entry.cost)} for that.`);
          for (const [id, amount] of entry.items) giveItem(player, new ItemStack(String(id), Number(amount)));
          player.sendMessage(`§aBought ${entry.name}.`);
          player.playSound("random.orb");
          pvpShopMenu(player);
        },
      })),
      { text: "Close", run: () => {} },
    ]
  );
}

// ---------- PvE Bot ----------

export function pveBotMenu(player) {
  if (inMatch(player) || inRun(player)) return player.sendMessage("§cYou're already in a fight.");
  const stats = getStats(player);
  const mine = lobbyOf(player);
  const body = [
    `Your highest wave: §2${stats.bestWave}`,
    "",
    "Fight waves of hostile mobs that get stronger every wave: more health, more damage, and armor.",
    `Every ${PVE.bossEvery}th wave has a boss. Mobs drop special loot, and you earn money for every wave you clear.`,
    "",
    `Up to ${PVE.maxPlayers} players. If you get knocked out you keep your items, and you're back next wave if your team survives.`,
  ].join("\n");
  const buttons = [];
  if (!mine) buttons.push({ text: "§2Start a new run\n§8Friends can join for " + PVE.lobbySeconds + " seconds", run: () => createLobby(player) });
  for (const lobby of openLobbies()) {
    if (lobby === mine) continue;
    buttons.push({ text: `Join ${lobby.leader}'s run\n§8${lobby.members.length}/${PVE.maxPlayers} players`, run: () => joinLobby(player, lobby.leaderId) });
  }
  if (mine) buttons.push({ text: "§cLeave this run", run: () => (leaveLobby(player), player.sendMessage("§eYou left the run.")) });
  buttons.push({ text: "Close", run: () => {} });
  menu(player, "§2§lPvE Bot", body, buttons);
}

// ---------- PvP Settings ----------

const PVP_MODES = { all: "Anyone", friends: "Friends only", fof: "Friends + their friends" };

function pvpSettingsMenu(player) {
  const stats = getStats(player);
  menu(
    player,
    "PvP Settings",
    `Who can you be matched with in PvP?\nNow: §e${PVP_MODES[stats.pvpMode]}§r\n\n§lFriends only§r: only your friends.\n§lFriends + their friends§r: your friends, and their friends too.`,
    [
      ...Object.entries(PVP_MODES).map(([mode, label]) => ({
        text: `${stats.pvpMode === mode ? "§2> " : ""}${label}`,
        run: () => {
          stats.pvpMode = mode;
          saveStats(player);
          player.sendMessage(`§aPvP: you'll be matched with ${label.toLowerCase()}.`);
          pvpBotMenu(player);
        },
      })),
      { text: "Back", run: () => pvpBotMenu(player) },
    ]
  );
}
