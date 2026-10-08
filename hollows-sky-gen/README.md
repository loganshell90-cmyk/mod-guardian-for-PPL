Hollow's Sky Gen - Part 1
=========================

A Minecraft Bedrock add-on: 350 sky islands, generators, money, upgrades,
stats and leaderboards. PvP (Part 2) and PvE (Part 3) come later.

Install
-------
1. Double-click "Hollows Sky Gen.mcaddon". Minecraft (or Minecraft Preview) opens and imports it.
2. Create a new world. Under Behavior Packs and Resource Packs, activate "Hollow's Sky Gen".
3. Play. No Beta APIs or cheats needed.

How it plays
------------
* The first person to ever join the world becomes the admin.
* Admin: open the Sky Menu (the glowing gem) > Admin Tools > "Build the hub here".
  That makes the hub island with the Money Bot and Upgrade Bot.
* Every player who joins gets the next free plot (1 to 350). After a 10 second
  countdown they're sent to their island, which is built the first time.
* Mine the generators (the blocks sitting on bedrock). They grow back.
* Go to the hub (/hub) and sell to the Money Bot. Spend money at the Upgrade Bot
  on better pickaxes, better generators and more generators.
* Fall off your island and you're put back on it.
* Other players can't break or place blocks on your island.

Commands
--------
  /plot          go to your island
  /plot 5        visit island 5
  /hub           go to the hub
  /skymenu       open the Sky Menu (if you lost the item)
If a command isn't found, add the prefix: /hsg:plot, /hsg:hub, /hsg:skymenu.

Leaderboards
------------
The side of the screen and a floating board on every island cycle through the
top 10 for: money, kills, K/D ratio, deaths, mob kills, blocks mined and time played.
The Sky Menu has the same boards, your own stats, and everyone else's stats.

Changing prices and settings
----------------------------
Everything (prices, generator levels, pickaxe tiers, join delay, plot spacing)
is in BP/scripts/config.js. After editing, run "python build.py" to make a new
.mcaddon, and raise the version numbers in both manifest.json files.

Admins
------
Admin = the "hsg_admin" tag. To add another admin (cheats on): /tag Name add hsg_admin
