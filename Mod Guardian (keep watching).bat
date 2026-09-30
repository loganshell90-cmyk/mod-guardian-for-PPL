@echo off
rem Checks your mods, then keeps watching and pops up when a new or updated mod arrives.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ModGuardian.ps1" -Watch
