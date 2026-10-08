// Top 10 leaderboards: shown on the side of the screen and floating above islands.
import { DisplaySlotId, ObjectiveSortOrder, system, world } from "@minecraft/server";
import { LEADERBOARD_SECONDS } from "./config.js";
import { allPlayers, kdr, money, rankName } from "./data.js";

export const BOARDS = [
  { id: "money", title: "Top Money", value: (s) => s.money, show: (s) => money(s.money) },
  {
    id: "rank",
    title: "Top Ranked",
    value: (s) => (s.rankedGames > 0 ? s.rating : 0),
    show: (s) => `${rankName(s)} §f${s.rating}`,
  },
  { id: "wins", title: "Most PvP Wins", value: (s) => s.wins, show: (s) => `${s.wins}` },
  { id: "kills", title: "Top Kills", value: (s) => s.kills, show: (s) => `${s.kills}` },
  { id: "kdr", title: "Top K/D Ratio", value: (s) => kdr(s), show: (s) => kdr(s).toFixed(2) },
  { id: "deaths", title: "Most Deaths", value: (s) => s.deaths, show: (s) => `${s.deaths}` },
  { id: "mobs", title: "Top Mob Kills", value: (s) => s.mobs, show: (s) => `${s.mobs}` },
  { id: "mined", title: "Top Blocks Mined", value: (s) => s.mined, show: (s) => `${s.mined}` },
  { id: "minutes", title: "Top Time Played", value: (s) => s.minutes, show: (s) => timePlayed(s.minutes) },
];

export function timePlayed(minutes) {
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

/** The top 10 players for a board: [{ stats, value }]. */
export function top10(board) {
  return allPlayers()
    .map(({ stats }) => ({ stats, value: board.value(stats) }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export function boardText(board) {
  const rows = top10(board).map((e, i) => `§e${i + 1}. §f${e.stats.name} §a${board.show(e.stats)}`);
  return [`§6§l${board.title}`, ...(rows.length ? rows : ["§7Nobody yet"])].join("\n");
}

const SIDEBAR = "hsg_board";
let current = 0;

function showSidebar(board) {
  const sb = world.scoreboard;
  // The sidebar title can't be changed, so the objective is remade each time.
  if (sb.getObjective(SIDEBAR)) sb.removeObjective(SIDEBAR);
  const objective = sb.addObjective(SIDEBAR, `§6§l${board.title}`);
  const rows = top10(board);
  if (rows.length === 0) objective.setScore("§7Nobody yet", 0);
  rows.forEach((e, i) => {
    // The sidebar can only show whole numbers on the right, so the real
    // value goes in the name and the number on the right is the rank order.
    objective.setScore(`§e${i + 1}. §f${e.stats.name} §a${board.show(e.stats)}`, 10 - i);
  });
  sb.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective, sortOrder: ObjectiveSortOrder.Descending });
}

function updateFloatingBoards(board) {
  const text = boardText(board);
  for (const entity of world.getDimension("overworld").getEntities({ type: "hsg:text" })) entity.nameTag = text;
}

export function startLeaderboards() {
  system.runInterval(() => {
    const board = BOARDS[current];
    current = (current + 1) % BOARDS.length;
    try {
      showSidebar(board);
      updateFloatingBoards(board);
    } catch (e) {
      console.warn(`[Hollow's Sky Gen] leaderboard: ${e}`);
    }
  }, LEADERBOARD_SECONDS * 20);
}
