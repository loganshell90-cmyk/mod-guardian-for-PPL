mod Guardian 0.1.0 - a mod safety checker for People Playground
================================================================

Run it BEFORE you start the game:
  * Double-click "Run Mod Guardian.bat" to check your mods once.
  * Double-click "Mod Guardian (keep watching).bat" to keep it open; it pops up
    whenever a new or updated mod lands in your Mods or Workshop folder.

It finds your People Playground Mods folder and Steam Workshop downloads by
itself, reads every mod's files (it never runs them), and shows a popup:
  RED     = looks dangerous (deletes files, turns off the game's safety setting,
            uploads to the Workshop with your account, reads Discord/Steam logins,
            ships a ready-made .dll/.exe, matches the FPS++ worm)
  YELLOW  = worth a look (internet access, hidden/scrambled text, touches other mods)
  BLUE    = the mod's description says it needs another mod you don't have
A full report is saved as "Mod Guardian Report.html" next to the script.

Mod Guardian never deletes or changes anything. It is a helper, not a real
antivirus: "no warnings" means nothing obvious was found, not a guarantee.

If it can't find your game, run in PowerShell:
  .\ModGuardian.ps1 -Path "D:\SteamLibrary\steamapps\common\People Playground\Mods"
