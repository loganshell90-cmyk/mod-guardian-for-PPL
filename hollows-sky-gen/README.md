Hollow's Sky Gen
================

A Minecraft Bedrock add-on: 350 sky islands, generators, money, upgrades,
stats, leaderboards, PvP and PvE.

Install
-------
1. Double-click "Hollows Sky Gen.mcaddon". Minecraft (or Minecraft Preview) opens and imports it.
2. Create a new world. Under Behavior Packs and Resource Packs, activate "Hollow's Sky Gen".
3. Play. No Beta APIs or cheats needed.

How it plays
------------
* The first person to ever join the world becomes the admin.
* The hub builds itself the first time anyone goes there (/hub), with the
  Money Bot, Upgrade Bot, PvP Bot, PvP Shop, PvE Bot and a leaderboard. If a bot goes
  missing, it comes back by itself within about 10 seconds while someone is
  near the hub. An admin can rebuild the hub somewhere else from Admin Tools.
* Every player who joins gets the next free plot (1 to 350). After a 10 second
  countdown they're sent to their island, which is built the first time.
* Mine the generators (the blocks sitting on bedrock). They grow back.
* Go to the hub (/hub) and sell to the Money Bot. Spend money at the Upgrade Bot
  on better pickaxes, better generators and more generators.
* Fall off your island and you're put back on it.
* Other players can't break or place blocks on your island.

PvP
---
* Talk to the PvP Bot at the hub and pick Casual 1v1, Casual 2v2, Ranked 1v1 or
  Ranked 2v2. You can keep playing while you wait in the queue.
* Casual: anyone vs anyone, with whatever gear you have.
* Ranked: everyone starts at 1000 rating. You're matched with players near your
  rating; win and it goes up, lose and it goes down. Beating stronger players
  gives more. Ranks: Bronze, Silver (1100), Gold (1250), Diamond (1400),
  Netherite (1600). Your rank shows above your head.
* Nobody loses items in the arena: a killing hit knocks you out instead.
  Falling out of the arena or leaving the game also knocks you out.
* Winners get money. Afterwards everyone goes back where they were.
* The PvP Shop sells golden apples, pearls, armor, swords, totems and more.

PvE
---
* Talk to the PvE Bot at the hub and start a run. Friends have 15 seconds to
  join from the PvE Bot (up to 4 players).
* Waves of hostile mobs get stronger every wave: more health, more damage,
  speed, and armor (chainmail, then iron, diamond and netherite).
* Every 5th wave is a boss wave (Zombie King, Ravager Beast, Evoker Lord,
  Bone Tyrant). Bosses always drop diamonds plus a rare item.
* Mobs drop special loot, rarer the higher the wave (a zombie can drop a
  netherite sword from wave 8).
* Clearing a wave pays everyone in the run money.
* Knocked out? You keep your items, watch as a spectator, and come back next
  wave if your team clears it. The run ends when everyone is knocked out.
* Leave early with /leave or the Sky Menu.
* Creepers can't blow holes in the arenas.

Commands
--------
  /plot          go to your island
  /plot 5        visit island 5
  /hub           go to the hub
  /leave         leave a PvE run or a PvP queue
  /skymenu       open the Sky Menu (if you lost the item)
If a command isn't found, add the prefix: /hsg:plot, /hsg:hub, /hsg:leave, /hsg:skymenu.

Leaderboards
------------
The side of the screen and a floating board on every island cycle through the
top 10 for: money, ranked rating, PvP wins, kills, K/D ratio, deaths, highest
PvE wave, mob kills, blocks mined and time played.
The Sky Menu has the same boards, your own stats, and everyone else's stats.

Changing prices and settings
----------------------------
Everything (prices, generator levels, pickaxe tiers, join delay, plot spacing)
is in BP/scripts/config.js. After editing, run "python build.py" to make a new
.mcaddon, and raise the version numbers in both manifest.json files.

Admins
------
Admin = the "hsg_admin" tag. To add another admin (cheats on): /tag Name add hsg_admin

Admin Tools (in the Sky Menu) can also:
* Put a player on a different plot. Their generator upgrades move with them.
  If that plot is taken, the two players swap. If the moved player had no plot,
  the old owner moves to the next free plot instead.
* Move a plot's island to where you're standing, or free up a plot.
* Spawn a blue axolotl (the rare one) where you're standing.
