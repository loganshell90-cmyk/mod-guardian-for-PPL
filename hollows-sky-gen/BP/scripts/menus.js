// All the pop-up screens: Sky Menu, Money Bot, Upgrade Bot, stats and admin tools.
import { EnchantmentTypes, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { GEN_LEVELS, GEN_SLOT_COST, GEN_SPOTS, PICKAXES, PLOTS, SELL_PRICES } from "./config.js";
import { addMoney, allPlayers, getPlot, getStats, kdr, money, resetPlot, savePlot, saveStats, statsById, trySpend } from "./data.js";
import {
  buildHub,
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
    { text: "§9Visit an Island", run: () => visitMenu(player) },
    { text: "§6Go to Hub", run: () => sendToHub(player) },
    { text: "§3My Stats", run: () => statsMenu(player, stats) },
    { text: "§5Leaderboards", run: () => leaderboardMenu(player) },
    { text: "§8Look at Players", run: () => playersMenu(player) },
  ];
  if (isAdmin(player)) buttons.push({ text: "§cAdmin Tools", run: () => adminMenu(player) });
  menu(player, "§l§bHollow's Sky Gen", `Money: §a${money(stats.money)}§r\nIsland: §e${stats.plot ? "Plot " + stats.plot : "none"}`, buttons);
}

function visitMenu(player) {
  const buttons = [];
  for (let start = 1; start <= PLOTS.count; start += 50) {
    const end = Math.min(start + 49, PLOTS.count);
    let taken = 0;
    for (let n = start; n <= end; n++) if (getPlot(n).owner) taken++;
    if (taken) buttons.push({ text: `Islands ${start} - ${end}\n§8${taken} taken`, run: () => visitPage(player, start, end) });
  }
  menu(player, "Visit an Island", buttons.length ? "Pick a group. You can also type /plot <number>." : "No islands yet.", buttons);
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
          ...(fresh.plot ? [{ text: "Visit their island", run: () => sendToPlot(player, fresh.plot, fresh.plot === getStats(player).plot) }] : []),
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
    { text: "Remove nearest bot", run: () => removeNearestBot(player) },
    { text: "Move a plot to here", run: () => movePlotMenu(player) },
    { text: "Free up a plot", run: () => freePlotMenu(player) },
    { text: "Give me $1,000\n§8For testing", run: () => addMoney(player, 1000) },
    { text: "Back", run: () => skyMenu(player) },
  ]);
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
