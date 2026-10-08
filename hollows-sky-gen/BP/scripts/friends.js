// Friends: requests, the friends list, visiting islands, and gifting money or items.
import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { addMoneyById, allPlayers, getStats, money, saveStats, saveStatsById, statsById, trySpend } from "./data.js";
import { sendToPlot } from "./islands.js";
import { menu, skyMenu, statsText } from "./menus.js";

const onlinePlayer = (id) => world.getAllPlayers().find((p) => p.id === id);

// ---------- Requests ----------

export function sendRequest(player, targetId) {
  const me = getStats(player);
  const them = statsById(targetId);
  if (!them || targetId === player.id) return player.sendMessage("§cYou can't add that player.");
  if (me.friends.includes(targetId)) return player.sendMessage(`§e${them.name} is already your friend.`);
  // They already asked you: just accept.
  if (me.requests.includes(targetId)) return acceptRequest(player, targetId);
  if (them.requests.includes(player.id)) return player.sendMessage(`§eYou already sent ${them.name} a request.`);
  them.requests.push(player.id);
  saveStatsById(targetId);
  player.sendMessage(`§aFriend request sent to ${them.name}.`);
  const p = onlinePlayer(targetId);
  if (p) {
    p.sendMessage(`§b${player.name} sent you a friend request! Open the Sky Menu > Friends > Friend Requests.`);
    p.playSound("random.orb");
  }
}

export function acceptRequest(player, fromId) {
  const me = getStats(player);
  const them = statsById(fromId);
  me.requests = me.requests.filter((id) => id !== fromId);
  if (!them) return saveStats(player);
  if (!me.friends.includes(fromId)) me.friends.push(fromId);
  if (!them.friends.includes(player.id)) them.friends.push(player.id);
  them.requests = them.requests.filter((id) => id !== player.id);
  saveStats(player);
  saveStatsById(fromId);
  player.sendMessage(`§aYou and ${them.name} are now friends!`);
  onlinePlayer(fromId)?.sendMessage(`§a${player.name} accepted your friend request!`);
}

function declineRequest(player, fromId) {
  const me = getStats(player);
  me.requests = me.requests.filter((id) => id !== fromId);
  saveStats(player);
  player.sendMessage(`§7Declined ${statsById(fromId)?.name ?? "the"} request.`);
}

function unfriend(player, friendId) {
  const me = getStats(player);
  const them = statsById(friendId);
  me.friends = me.friends.filter((id) => id !== friendId);
  saveStats(player);
  if (them) {
    them.friends = them.friends.filter((id) => id !== player.id);
    saveStatsById(friendId);
  }
  player.sendMessage(`§7You unfriended ${them?.name ?? "them"}.`);
}

/** Tells a player about friend requests waiting for them (used when they join). */
export function remindRequests(player) {
  const count = getStats(player).requests.length;
  if (count) player.sendMessage(`§bYou have ${count} friend request${count === 1 ? "" : "s"}! Open the Sky Menu > Friends.`);
}

// ---------- Menus ----------

export function friendsMenu(player) {
  const me = getStats(player);
  menu(player, "§b§lFriends", `You have §a${me.friends.length}§r friend${me.friends.length === 1 ? "" : "s"}.\nOnly friends can visit each other's islands and send gifts.`, [
    { text: `§2My Friends (${me.friends.length})\n§8Islands, stats, gifts`, run: () => friendList(player) },
    { text: `§bFriend Requests (${me.requests.length})`, run: () => requestList(player) },
    { text: "§9Add a Friend", run: () => addFriendMenu(player) },
    { text: "Back", run: () => skyMenu(player) },
  ]);
}

function friendList(player) {
  const me = getStats(player);
  const online = new Set(world.getAllPlayers().map((p) => p.id));
  const friends = me.friends.map((id) => ({ id, stats: statsById(id) })).filter((f) => f.stats);
  friends.sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.stats.name.localeCompare(b.stats.name));
  menu(
    player,
    "My Friends",
    friends.length ? "Tap a friend." : "No friends yet. Use Add a Friend!",
    [
      ...friends.map((f) => ({ text: `${f.stats.name}\n${online.has(f.id) ? "§2online" : "§8offline"}`, run: () => friendPage(player, f.id) })),
      { text: "Back", run: () => friendsMenu(player) },
    ]
  );
}

function friendPage(player, id) {
  const them = statsById(id);
  if (!them) return;
  const buttons = [];
  if (them.plot) buttons.push({ text: "§2Go to their island", run: () => sendToPlot(player, them.plot, false) });
  buttons.push({ text: "§6Gift money", run: () => giftMoneyMenu(player, id) });
  buttons.push({ text: "§dGift items\n§8They must be online", run: () => giftItemMenu(player, id) });
  buttons.push({ text: "§cUnfriend", run: () => confirmUnfriend(player, id) });
  buttons.push({ text: "Back", run: () => friendList(player) });
  menu(player, them.name, statsText(them), buttons);
}

function confirmUnfriend(player, id) {
  const name = statsById(id)?.name ?? "them";
  menu(player, "Unfriend?", `Are you sure you want to unfriend ${name}?`, [
    { text: "§cYes, unfriend", run: () => unfriend(player, id) },
    { text: "No", run: () => friendPage(player, id) },
  ]);
}

function requestList(player) {
  const me = getStats(player);
  const reqs = me.requests.map((id) => ({ id, stats: statsById(id) })).filter((r) => r.stats);
  menu(
    player,
    "Friend Requests",
    reqs.length ? "These players want to be your friend." : "No friend requests right now.",
    [
      ...reqs.map((r) => ({
        text: r.stats.name,
        run: () =>
          menu(player, r.stats.name, `${r.stats.name} wants to be your friend.`, [
            { text: "§2Accept", run: () => acceptRequest(player, r.id) },
            { text: "§cDecline", run: () => declineRequest(player, r.id) },
            { text: "Back", run: () => requestList(player) },
          ]),
      })),
      { text: "Back", run: () => friendsMenu(player) },
    ]
  );
}

function addFriendMenu(player) {
  const me = getStats(player);
  const online = world.getAllPlayers().filter((p) => p.id !== player.id && !me.friends.includes(p.id));
  menu(player, "Add a Friend", "Type someone's name, or tap a player who's online.", [
    { text: "§9Type a name", run: () => typeNameMenu(player) },
    ...online.map((p) => ({ text: `${p.name}\n§2online`, run: () => profileToAdd(player, p.id) })),
    { text: "Back", run: () => friendsMenu(player) },
  ]);
}

function typeNameMenu(player) {
  new ModalFormData()
    .title("Add a Friend")
    .textField("Their username", "e.g. Jimmy")
    .show(player)
    .then((res) => {
      if (res.canceled) return;
      const typed = String(res.formValues?.[0] ?? "").trim().toLowerCase();
      if (!typed) return;
      const found = allPlayers().find(({ stats }) => stats.name.toLowerCase() === typed);
      if (!found) return player.sendMessage(`§cNo player called "${typed}" has joined this world yet.`);
      profileToAdd(player, found.id);
    });
}

/** Their profile with an Add button. */
function profileToAdd(player, id) {
  const them = statsById(id);
  if (!them) return;
  menu(player, them.name, statsText(them), [
    { text: "§2Add friend", run: () => sendRequest(player, id) },
    { text: "Back", run: () => addFriendMenu(player) },
  ]);
}

// ---------- Gifts ----------

function giftMoneyMenu(player, id) {
  const name = statsById(id)?.name;
  const me = getStats(player);
  const amounts = [10, 50, 100, 500, 1000, 5000].filter((a) => a <= me.money);
  menu(player, `Gift money to ${name}`, `You have §a${money(me.money)}§r.`, [
    ...amounts.map((a) => ({ text: money(a), run: () => giftMoney(player, id, a) })),
    { text: "§9Type an amount", run: () => typeAmount(player, id) },
    { text: "Back", run: () => friendPage(player, id) },
  ]);
}

function typeAmount(player, id) {
  new ModalFormData()
    .title(`Gift money to ${statsById(id)?.name}`)
    .textField(`How much? You have ${money(getStats(player).money)}.`, "e.g. 250")
    .show(player)
    .then((res) => {
      if (res.canceled) return;
      const amount = Math.floor(Number(String(res.formValues?.[0] ?? "").replace(/[$,\s]/g, "")));
      if (!Number.isFinite(amount) || amount <= 0) return player.sendMessage("§cThat's not an amount.");
      giftMoney(player, id, amount);
    });
}

function giftMoney(player, id, amount) {
  const them = statsById(id);
  if (!them || !isFriendOf(player, id)) return player.sendMessage("§cYou can only gift to friends.");
  if (!trySpend(player, amount)) return player.sendMessage(`§cYou don't have ${money(amount)}.`);
  addMoneyById(id, amount);
  player.sendMessage(`§aYou gifted ${money(amount)} to ${them.name}.`);
  const p = onlinePlayer(id);
  if (p) {
    p.sendMessage(`§6${player.name} gifted you ${money(amount)}!`);
    p.playSound("random.orb");
  }
}

const isFriendOf = (player, id) => getStats(player).friends.includes(id);

/** Items you can't gift: the Sky Menu and your Sky Pickaxe. */
function giftable(item) {
  return item && item.typeId !== "hsg:sky_menu" && item.getLore()[0] !== "§bSky Pickaxe";
}

function itemName(item) {
  return item.nameTag ?? item.typeId.replace("minecraft:", "").split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function giftItemMenu(player, id) {
  const them = statsById(id);
  if (!onlinePlayer(id)) return player.sendMessage(`§c${them?.name} has to be online to get items.`);
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  const slots = [];
  for (let i = 0; i < inv.size; i++) if (giftable(inv.getItem(i))) slots.push(i);
  menu(
    player,
    `Gift items to ${them?.name}`,
    slots.length ? "Pick what to give. The whole stack is sent." : "You don't have anything to gift.",
    [
      ...slots.map((i) => {
        const item = inv.getItem(i);
        return { text: `${itemName(item)} x${item.amount}`, run: () => giftItem(player, id, i) };
      }),
      { text: "Back", run: () => friendPage(player, id) },
    ]
  );
}

function giftItem(player, id, slot) {
  const target = onlinePlayer(id);
  if (!target) return player.sendMessage("§cThey went offline.");
  if (!isFriendOf(player, id)) return player.sendMessage("§cYou can only gift to friends.");
  const inv = player.getComponent("minecraft:inventory")?.container;
  const item = inv?.getItem(slot);
  if (!item || !giftable(item)) return player.sendMessage("§cThat item isn't there any more.");
  inv.setItem(slot);
  const left = target.getComponent("minecraft:inventory")?.container?.addItem(item);
  if (left) target.dimension.spawnItem(left, target.location);
  player.sendMessage(`§aYou gifted ${itemName(item)} x${item.amount} to ${target.name}.`);
  target.sendMessage(`§6${player.name} gifted you ${itemName(item)} x${item.amount}!`);
  target.playSound("random.orb");
}
