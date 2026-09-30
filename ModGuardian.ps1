<#
    Mod Guardian for People Playground
    ----------------------------------
    A friendly safety checker you run BEFORE starting the game.

    What it does:
      * Finds your People Playground "Mods" folder and your Steam Workshop
        downloads for the game.
      * Reads every mod's files (it never runs them) and looks for code that
        does things a normal mod has no reason to do: deleting files, turning
        off the game's safety setting, uploading to the Workshop with your
        account, reading passwords or Discord logins, and so on.
      * Tells you when a mod says it needs another mod that you don't have.
      * Shows a popup with the result and writes a report you can read.

    What it does NOT do:
      * It never deletes, moves or changes any mod. You decide what to do.
      * It is not a real antivirus. "No warnings" means "nothing obvious",
        not "guaranteed safe". If in doubt, don't run the mod.

    Usage:
      Double-click "Run Mod Guardian.bat", or from PowerShell:
        .\ModGuardian.ps1                 scan once and show a popup
        .\ModGuardian.ps1 -Watch          keep running and check new mods as they arrive
        .\ModGuardian.ps1 -Path D:\Stuff  also scan another folder
        .\ModGuardian.ps1 -NoPopup        console + report only
#>
[CmdletBinding()]
param(
    [string[]]$Path = @(),
    [switch]$Watch,
    [switch]$NoPopup,
    [switch]$NoSteam,
    [string]$ReportPath = ""
)

$ErrorActionPreference = 'Continue'
$GuardianVersion = '0.1.0'
$PpgAppId = '1118200'
$OnWindows = ($env:OS -eq 'Windows_NT')

# ---------------------------------------------------------------------------
# Rules. Each rule is a regex that is searched for in a mod's code files.
#   Danger  = a normal mod has basically no reason to do this.
#   Warning = sometimes fine, but worth a look.
#   Info    = common in normal mods, only listed so you know.
# ---------------------------------------------------------------------------
$Rules = @(
    @{ Id = 'shady-off';     Level = 'Danger';  Pattern = 'RejectShadyCode';
       Why = "Tries to switch off People Playground's own mod-safety setting. The FPS++ worm did exactly this." }
    @{ Id = 'achievements';  Level = 'Danger';  Pattern = 'SteamUserStats\s*\.\s*ResetAll|ResetAllStats';
       Why = 'Can wipe your Steam achievements and stats.' }
    @{ Id = 'prefs-wipe';    Level = 'Danger';  Pattern = 'PlayerPrefs\s*\.\s*DeleteAll';
       Why = 'Can wipe all your game settings.' }
    @{ Id = 'delete-files';  Level = 'Danger';  Pattern = '\b(File|Directory|FileInfo|DirectoryInfo)\s*\.\s*Delete\b|\.Delete\s*\(\s*true\s*\)';
       Why = 'Can delete files or folders on your computer.' }
    @{ Id = 'write-files';   Level = 'Warning'; Pattern = '\bFile\s*\.\s*(WriteAll\w*|AppendAll\w*|Copy|Move|Replace|Create|Open)\b|\bnew\s+StreamWriter\b|\bFileStream\b';
       Why = 'Can create or overwrite files on your computer.' }
    @{ Id = 'workshop-post'; Level = 'Danger';  Pattern = 'NewCommunityFile|SubmitAsync|CreateItem\s*\(|StartItemUpdate|SubmitItemUpdate';
       Why = "Can upload things to the Steam Workshop using YOUR account. That's how worms spread." }
    @{ Id = 'workshop-vote'; Level = 'Danger';  Pattern = '\.\s*Vote\s*\(|AddFavorite|SetUserItemVote|AddItemToFavorites';
       Why = 'Can like or favourite Workshop items with your account (FPS++ used this to boost itself).' }
    @{ Id = 'steam-friends'; Level = 'Danger';  Pattern = 'SteamFriends|SendMessageToFriend|ReplyToFriendMessage|ActivateGameOverlayToUser';
       Why = 'Can message your Steam friends or read your friends list.' }
    @{ Id = 'logins';        Level = 'Danger';  Pattern = '(?i)discord\w*\s*[\\/"+,]|Local Storage|leveldb|Login Data|Network[\\/]+Cookies|loginusers\.vdf|config\.vdf|\bssfn\w*|Web Data|Local State';
       Why = 'Mentions password, cookie, Discord or Steam login files. Stealing logins is what the 2026 malware did.' }
    @{ Id = 'run-program';   Level = 'Danger';  Pattern = 'Process\s*\.\s*Start|ProcessStartInfo|cmd\.exe|powershell';
       Why = 'Can start other programs on your computer.' }
    @{ Id = 'native';        Level = 'Danger';  Pattern = 'DllImport|kernel32|user32|ntdll|GetDelegateForFunctionPointer|Marshal\s*\.\s*Copy';
       Why = 'Talks to Windows directly, completely outside the game.' }
    @{ Id = 'load-code';     Level = 'Danger';  Pattern = 'Assembly\s*\.\s*(Load|LoadFrom|LoadFile|UnsafeLoadFrom)|CSharpCodeProvider|CompileAssemblyFrom|AppDomain\s*\.\s*CreateDomain';
       Why = 'Loads hidden extra code that this checker cannot see.' }
    @{ Id = 'other-mods';    Level = 'Warning'; Pattern = 'SetModActive|MetaLocation|ModLoader\s*\.\s*(LoadedMods|ModList)';
       Why = 'Looks at or switches other mods on and off. The FPS++ worm used this to infect other mods.' }
    @{ Id = 'user-folders';  Level = 'Warning'; Pattern = 'Environment\s*\.\s*(GetFolderPath|SpecialFolder|UserName|MachineName)|%APPDATA%|%USERPROFILE%|\bAppData\b|Application\s*\.\s*(dataPath|persistentDataPath)';
       Why = 'Looks at folders or info outside its own mod folder (your user folder, game data, PC name).' }
    @{ Id = 'internet';      Level = 'Warning'; Pattern = 'System\s*\.\s*Net\b|WebClient|HttpClient|WebRequest|UnityWebRequest|TcpClient|UdpClient|\bSocket\b';
       Why = 'Can talk to the internet. Most mods never need this.' }
    @{ Id = 'steam-direct';  Level = 'Warning'; Pattern = '\bSteamworks\b|SteamUGC|SteamClient|SteamUser\b';
       Why = 'Uses Steam directly instead of just the game.' }
    @{ Id = 'hidden-text';   Level = 'Warning'; Pattern = 'FromBase64String|(\\x[0-9A-Fa-f]{2}){8,}|(\\u[0-9A-Fa-f]{4}){8,}|[A-Za-z0-9+/]{400,}={0,2}';
       Why = 'Contains hidden or scrambled text. Malware often hides what it does this way.' }
    @{ Id = 'reflection';    Level = 'Info';    Pattern = 'BindingFlags\s*\.\s*NonPublic|Type\s*\.\s*GetType\s*\(|InvokeMember';
       Why = 'Uses reflection to reach hidden parts of the game. Common in normal mods, but it can also be used to sneak around the rules.' }
)

# File types a People Playground mod should NOT normally contain.
$RiskyExtensions = @{
    '.exe' = 'Danger';  '.scr' = 'Danger';  '.bat' = 'Danger';  '.cmd' = 'Danger'
    '.ps1' = 'Danger';  '.vbs' = 'Danger';  '.js'  = 'Warning'; '.msi' = 'Danger'
    '.dll' = 'Danger';  '.lnk' = 'Warning'; '.jar' = 'Danger';  '.hta' = 'Danger'
}
# Names known from the 2026 outbreaks.
$KnownBadNames = @('FPS\s*\+\+', 'FPSPlusPlus')

$LevelRank = @{ 'Danger' = 3; 'Warning' = 2; 'Info' = 1; 'Ok' = 0 }

# ---------------------------------------------------------------------------
# Finding the folders
# ---------------------------------------------------------------------------
function Get-SteamLibraries {
    $roots = New-Object System.Collections.Generic.List[string]
    $steam = $null
    if ($OnWindows) {
        foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam') {
            try {
                $p = Get-ItemProperty -Path $key -ErrorAction Stop
                if ($p.SteamPath) { $steam = $p.SteamPath; break }
                if ($p.InstallPath) { $steam = $p.InstallPath; break }
            } catch { }
        }
        if (-not $steam) {
            foreach ($guess in "${env:ProgramFiles(x86)}\Steam", "$env:ProgramFiles\Steam") {
                if ($guess -and (Test-Path $guess)) { $steam = $guess; break }
            }
        }
    } else {
        foreach ($guess in "$HOME/.steam/steam", "$HOME/.local/share/Steam") {
            if (Test-Path $guess) { $steam = $guess; break }
        }
    }
    if (-not $steam) { return $roots }
    $steam = $steam -replace '/', [IO.Path]::DirectorySeparatorChar
    $roots.Add($steam)

    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (-not $OnWindows) { $vdf = Join-Path $steam 'steamapps/libraryfolders.vdf' }
    if (Test-Path $vdf) {
        foreach ($m in [regex]::Matches((Get-Content -Raw -LiteralPath $vdf), '"path"\s+"([^"]+)"')) {
            $lib = $m.Groups[1].Value -replace '\\\\', '\'
            if (-not $roots.Contains($lib)) { $roots.Add($lib) }
        }
    }
    return $roots
}

function Get-ScanRoots {
    $result = New-Object System.Collections.Generic.List[object]
    if (-not $NoSteam) {
        foreach ($lib in Get-SteamLibraries) {
            $game = Join-Path (Join-Path (Join-Path $lib 'steamapps') 'common') 'People Playground'
            $mods = Join-Path $game 'Mods'
            $ws   = Join-Path (Join-Path (Join-Path (Join-Path $lib 'steamapps') 'workshop') 'content') $PpgAppId
            if (Test-Path -LiteralPath $mods) { $result.Add([pscustomobject]@{ Kind = 'Mods folder'; Path = $mods }) }
            if (Test-Path -LiteralPath $ws)   { $result.Add([pscustomobject]@{ Kind = 'Workshop downloads'; Path = $ws }) }
        }
    }
    foreach ($p in $Path) {
        if (Test-Path -LiteralPath $p) { $result.Add([pscustomobject]@{ Kind = 'Extra folder'; Path = (Resolve-Path -LiteralPath $p).Path }) }
        else { Write-Host "  Can't find folder: $p" -ForegroundColor Yellow }
    }
    return $result
}

# A "mod" is any folder that has a mod.json in it. Workshop items are one
# folder per item id, so we also treat each workshop item folder as a mod
# even if the mod.json is missing (that is suspicious in itself).
function Get-ModFolders($root) {
    $found = @{}
    Get-ChildItem -LiteralPath $root.Path -Recurse -Filter 'mod.json' -File -ErrorAction SilentlyContinue |
        ForEach-Object { $found[$_.DirectoryName] = $true }
    # Every top-level folder counts too, even without a mod.json (workshop items
    # are one folder per item id, and a folder with no mod.json is odd in itself).
    Get-ChildItem -LiteralPath $root.Path -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $inside = $false
        foreach ($k in @($found.Keys)) { if ($k.StartsWith($_.FullName)) { $inside = $true } }
        if (-not $inside) { $found[$_.FullName] = $true }
    }
    return @($found.Keys | Sort-Object)
}

# ---------------------------------------------------------------------------
# Checking one mod
# ---------------------------------------------------------------------------
function New-Finding($level, $what, $why, $file, $line, $snippet) {
    [pscustomobject]@{ Level = $level; What = $what; Why = $why; File = $file; Line = $line; Snippet = $snippet }
}

function Read-ModJson($folder) {
    $file = Join-Path $folder 'mod.json'
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    try { return (Get-Content -Raw -LiteralPath $file -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop) }
    catch { return 'unreadable' }
}

function Test-Mod($folder, $rootKind) {
    $findings = New-Object System.Collections.Generic.List[object]
    $meta = Read-ModJson $folder
    $name = Split-Path $folder -Leaf
    $author = ''
    $description = ''

    if ($null -eq $meta) {
        $findings.Add((New-Finding 'Warning' 'No mod.json' 'This folder has no mod.json, so it is not a normal People Playground mod.' '' 0 ''))
    } elseif ($meta -eq 'unreadable') {
        $findings.Add((New-Finding 'Warning' 'Broken mod.json' "mod.json can't be read. The mod probably won't load." 'mod.json' 0 ''))
    } else {
        if ($meta.Name) { $name = [string]$meta.Name }
        if ($meta.Author) { $author = [string]$meta.Author }
        if ($meta.Description) { $description = [string]$meta.Description }

        foreach ($s in @($meta.Scripts)) {
            if (-not $s) { continue }
            if (-not (Test-Path -LiteralPath (Join-Path $folder $s))) {
                $findings.Add((New-Finding 'Warning' 'Missing file' "mod.json lists '$s' but that file isn't there, so this mod will probably fail to load. Try re-downloading it." 'mod.json' 0 ''))
            }
        }
    }

    foreach ($bad in $KnownBadNames) {
        if ($name -match $bad -or (Split-Path $folder -Leaf) -match $bad) {
            $findings.Add((New-Finding 'Danger' 'Known malware name' 'The name matches the FPS++ worm that infected People Playground mods in 2026.' '' 0 $name))
        }
    }

    Get-ChildItem -LiteralPath $folder -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($folder.Length).TrimStart('\', '/')
        $ext = $_.Extension.ToLowerInvariant()

        foreach ($bad in $KnownBadNames) {
            if ($_.Name -match $bad) {
                $findings.Add((New-Finding 'Danger' 'Known malware file' 'This file name matches the FPS++ worm.' $rel 0 $_.Name))
            }
        }

        if ($RiskyExtensions.ContainsKey($ext)) {
            $findings.Add((New-Finding $RiskyExtensions[$ext] "Unusual file type ($ext)" 'People Playground mods are plain code the game builds itself. A ready-made program or library inside a mod is a big red flag.' $rel 0 ''))
        }

        $isCode = $ext -in @('.cs', '.txt', '.json', '.js', '.lua', '.ps1', '.bat', '.cmd', '.vbs')
        $isBinary = $ext -in @('.dll', '.exe', '.scr')
        if (-not ($isCode -or $isBinary)) { return }
        if ($_.Length -gt 20MB) { return }
        if ($_.Name -eq 'mod.json') { return }

        if ($isBinary) {
            # Look for readable text inside the program file.
            $bytes = [IO.File]::ReadAllBytes($_.FullName)
            $text = [Text.Encoding]::GetEncoding(28591).GetString($bytes) + "`n" + [Text.Encoding]::Unicode.GetString($bytes)
            foreach ($r in $Rules) {
                if ($r.Level -eq 'Info') { continue }
                if ($text -match $r.Pattern) {
                    $findings.Add((New-Finding $r.Level $r.Id $r.Why $rel 0 '(found inside a program file)'))
                }
            }
            return
        }

        $lines = Get-Content -LiteralPath $_.FullName -ErrorAction SilentlyContinue
        $lineNo = 0
        $seen = @{}
        foreach ($l in @($lines)) {
            $lineNo++
            if ($l.Length -gt 3000) {
                if (-not $seen['long']) {
                    $findings.Add((New-Finding 'Warning' 'hidden-text' 'Has an extremely long line of code. That is usually done to hide what the code does.' $rel $lineNo ($l.Substring(0, 80) + '...')))
                    $seen['long'] = $true
                }
            }
            foreach ($r in $Rules) {
                if ($seen[$r.Id]) { continue }
                if ($l -match $r.Pattern) {
                    $snip = $l.Trim()
                    if ($snip.Length -gt 140) { $snip = $snip.Substring(0, 140) + '...' }
                    $findings.Add((New-Finding $r.Level $r.Id $r.Why $rel $lineNo $snip))
                    $seen[$r.Id] = $true
                }
            }
        }
    }

    $worst = 'Ok'
    foreach ($f in $findings) { if ($LevelRank[$f.Level] -gt $LevelRank[$worst]) { $worst = $f.Level } }

    [pscustomobject]@{
        Name        = $name
        Author      = $author
        Description = $description
        Folder      = $folder
        Source      = $rootKind
        Findings    = $findings
        Worst       = $worst
        Needs       = New-Object System.Collections.Generic.List[string]
    }
}

# ---------------------------------------------------------------------------
# "You need this other mod" hints
# People Playground has no official dependency list in mod.json, so we read
# the mod's description for phrases like "Requires: Some Mod" and check if
# a mod with that name is installed.
# ---------------------------------------------------------------------------
function Get-CleanName([string]$s) {
    return (($s.ToLowerInvariant() -replace '\[[^\]]*\]', '' -replace '[^a-z0-9]+', ' ').Trim())
}

function Find-MissingDependencies($mods) {
    $installed = @($mods | ForEach-Object { Get-CleanName $_.Name } | Where-Object { $_ })
    $pattern = '(?im)\b(?:requires?|required|needs?|depends on|dependency|dependencies|you (?:will )?need(?: to (?:download|install|subscribe to))?|must (?:have|install|subscribe to))\b\s*(?:the\s+)?(?:mod\s+)?[:\-]?\s*["''\u201C]?([^\r\n"''\u201D.!,;(]{3,60})'
    foreach ($m in $mods) {
        if (-not $m.Description) { continue }
        foreach ($match in [regex]::Matches($m.Description, $pattern)) {
            $wanted = ($match.Groups[1].Value -replace '(?i)\s+(to|for|so|if|because|or|and|in order)\s+.*$', '').Trim()
            $clean = Get-CleanName ($wanted -replace '(?i)\b(mod|to work|to use|to play|first|installed|as well|too|also)\b', '')
            if ($clean.Length -lt 3) { continue }
            if ($clean -match '^(this|it|a|an|nothing|no|any|none|that|them)\b') { continue }
            $have = $false
            foreach ($i in $installed) {
                if ($i -eq $clean -or $i.Contains($clean) -or $clean.Contains($i)) { $have = $true; break }
            }
            if (-not $have -and -not $m.Needs.Contains($wanted)) { $m.Needs.Add($wanted) }
        }
    }
}

# ---------------------------------------------------------------------------
# Output: console, HTML report, popup
# ---------------------------------------------------------------------------
function HtmlEncode([string]$s) { if ($null -eq $s) { return '' }; return [System.Net.WebUtility]::HtmlEncode($s) }

function Write-ConsoleReport($mods) {
    $colors = @{ 'Danger' = 'Red'; 'Warning' = 'Yellow'; 'Info' = 'Gray'; 'Ok' = 'Green' }
    foreach ($m in ($mods | Sort-Object { - $LevelRank[$_.Worst] }, Name)) {
        $label = switch ($m.Worst) { 'Danger' { 'DANGER ' } 'Warning' { 'CHECK  ' } 'Info' { 'OK     ' } default { 'OK     ' } }
        Write-Host ("  [{0}] {1}" -f $label, $m.Name) -ForegroundColor $colors[$m.Worst]
        foreach ($f in $m.Findings) {
            if ($f.Level -eq 'Info') { continue }
            $where = ''
            if ($f.File) { $where = " ($($f.File)$(if ($f.Line) { ":$($f.Line)" }))" }
            Write-Host ("            - {0}{1}" -f $f.Why, $where) -ForegroundColor $colors[$f.Level]
        }
        foreach ($n in $m.Needs) {
            Write-Host ("            - Says it needs '{0}', which you don't seem to have." -f $n) -ForegroundColor Cyan
        }
    }
}

function Write-HtmlReport($mods, $roots, $file) {
    $danger  = @($mods | Where-Object { $_.Worst -eq 'Danger' }).Count
    $warning = @($mods | Where-Object { $_.Worst -eq 'Warning' }).Count
    $needs   = @($mods | Where-Object { $_.Needs.Count -gt 0 }).Count
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append(@"
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mod Guardian Report</title>
<style>
:root{--bg:#f6f7fb;--card:#fff;--text:#1d2230;--muted:#667;--danger:#c62828;--warn:#b26a00;--ok:#2e7d32;--need:#1565c0;--border:#e2e5ee}
@media (prefers-color-scheme:dark){:root{--bg:#14161c;--card:#1e2129;--text:#e8eaf0;--muted:#9aa;--danger:#ef5350;--warn:#ffb74d;--ok:#66bb6a;--need:#64b5f6;--border:#2c303b}}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,Segoe UI,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px}
h1{margin:0 0 4px;font-size:24px} .sub{color:var(--muted);margin:0 0 20px}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.pill{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 14px;min-width:120px}
.pill b{display:block;font-size:22px}
.mod{background:var(--card);border:1px solid var(--border);border-left:6px solid var(--ok);border-radius:10px;padding:12px 16px;margin:10px 0}
.mod.Danger{border-left-color:var(--danger)} .mod.Warning{border-left-color:var(--warn)}
.mod h2{font-size:17px;margin:0} .meta{color:var(--muted);font-size:13px;word-break:break-all}
.f{margin:8px 0 0;padding-left:10px;border-left:3px solid var(--border)}
.Danger .tag.Danger,.tag.Danger{color:var(--danger)} .tag.Warning{color:var(--warn)} .tag.Info{color:var(--muted)} .tag.Need{color:var(--need)}
.tag{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
code{font-size:12px;background:var(--bg);padding:1px 4px;border-radius:4px;word-break:break-all}
.note{color:var(--muted);font-size:13px;margin-top:24px}
</style></head><body><main>
<h1>Mod Guardian Report</h1>
<p class="sub">Checked $($mods.Count) mod(s) on $(Get-Date -Format 'yyyy-MM-dd HH:mm'). Mod Guardian only reads files. It never changes or deletes anything.</p>
<div class="sum">
<div class="pill"><b style="color:var(--danger)">$danger</b>look dangerous</div>
<div class="pill"><b style="color:var(--warn)">$warning</b>worth a look</div>
<div class="pill"><b style="color:var(--need)">$needs</b>need another mod</div>
</div>
"@)
    foreach ($m in ($mods | Sort-Object { - $LevelRank[$_.Worst] }, Name)) {
        [void]$sb.Append("<div class=`"mod $($m.Worst)`"><h2>$(HtmlEncode $m.Name)</h2>")
        $by = ''; if ($m.Author) { $by = "by $(HtmlEncode $m.Author) &middot; " }
        [void]$sb.Append("<div class=`"meta`">$by$(HtmlEncode $m.Source) &middot; $(HtmlEncode $m.Folder)</div>")
        if ($m.Findings.Count -eq 0 -and $m.Needs.Count -eq 0) {
            [void]$sb.Append('<div class="f"><span class="tag" style="color:var(--ok)">Looks fine</span> Nothing suspicious found.</div>')
        }
        foreach ($f in ($m.Findings | Sort-Object { - $LevelRank[$_.Level] })) {
            $where = ''
            if ($f.File) { $where = " <code>$(HtmlEncode $f.File)$(if ($f.Line) { ":$($f.Line)" })</code>" }
            $snip = ''; if ($f.Snippet) { $snip = "<br><code>$(HtmlEncode $f.Snippet)</code>" }
            [void]$sb.Append("<div class=`"f`"><span class=`"tag $($f.Level)`">$($f.Level)</span> $(HtmlEncode $f.Why)$where$snip</div>")
        }
        foreach ($n in $m.Needs) {
            [void]$sb.Append("<div class=`"f`"><span class=`"tag Need`">Needs a mod</span> The description says it needs <b>$(HtmlEncode $n)</b>, and you don't seem to have it. Download it too, or this mod might not work.</div>")
        }
        [void]$sb.Append('</div>')
    }
    [void]$sb.Append('<p class="note">Folders checked: ')
    [void]$sb.Append((($roots | ForEach-Object { HtmlEncode "$($_.Kind): $($_.Path)" }) -join ' &middot; '))
    [void]$sb.Append("</p><p class=`"note`">Mod Guardian $GuardianVersion is a helper, not a real antivirus. If a mod looks dangerous, don't start the game with it installed: unsubscribe from it, delete its folder, and tell other players.</p></main></body></html>")
    Set-Content -LiteralPath $file -Value $sb.ToString() -Encoding UTF8
}

function Show-Popup($mods, $reportFile) {
    if ($NoPopup -or -not $OnWindows) { return }
    try { Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop } catch { return }

    $danger  = @($mods | Where-Object { $_.Worst -eq 'Danger' })
    $warning = @($mods | Where-Object { $_.Worst -eq 'Warning' })
    $needs   = @($mods | Where-Object { $_.Needs.Count -gt 0 })

    if ($danger.Count -gt 0) {
        $names = ($danger | Select-Object -First 5 | ForEach-Object { "  - $($_.Name)" }) -join "`n"
        $msg = "Mod Guardian found $($danger.Count) mod(s) that look DANGEROUS:`n`n$names`n`nDon't start People Playground until you've removed or checked them.`n`nOpen the full report?"
        $icon = [System.Windows.Forms.MessageBoxIcon]::Error
    } elseif ($warning.Count -gt 0 -or $needs.Count -gt 0) {
        $parts = @()
        if ($warning.Count -gt 0) { $parts += "$($warning.Count) mod(s) do things worth a quick look." }
        foreach ($m in ($needs | Select-Object -First 5)) { $parts += "'$($m.Name)' needs: $($m.Needs -join ', ')" }
        $msg = "Mod Guardian checked $($mods.Count) mod(s).`n`n" + ($parts -join "`n") + "`n`nOpen the full report?"
        $icon = [System.Windows.Forms.MessageBoxIcon]::Warning
    } else {
        $msg = "All clear! Mod Guardian checked $($mods.Count) mod(s) and found nothing suspicious.`n`nOpen the report anyway?"
        $icon = [System.Windows.Forms.MessageBoxIcon]::Information
    }
    $answer = [System.Windows.Forms.MessageBox]::Show($msg, 'Mod Guardian', [System.Windows.Forms.MessageBoxButtons]::YesNo, $icon)
    if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) { Start-Process $reportFile }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
function Invoke-Scan($roots) {
    $mods = New-Object System.Collections.Generic.List[object]
    foreach ($r in $roots) {
        foreach ($folder in Get-ModFolders $r) { $mods.Add((Test-Mod $folder $r.Kind)) }
        # Risky files lying loose in the root folder (not inside any mod)
        Get-ChildItem -LiteralPath $r.Path -File -ErrorAction SilentlyContinue | Where-Object { $RiskyExtensions.ContainsKey($_.Extension.ToLowerInvariant()) } | ForEach-Object {
            $loose = [pscustomobject]@{
                Name = $_.Name; Author = ''; Description = ''; Folder = $_.FullName; Source = $r.Kind
                Findings = New-Object System.Collections.Generic.List[object]; Worst = 'Danger'
                Needs = New-Object System.Collections.Generic.List[string]
            }
            $loose.Findings.Add((New-Finding 'Danger' 'Loose program file' "A program file is sitting in your $($r.Kind.ToLower()) outside any mod. That shouldn't be there." $_.Name 0 ''))
            $mods.Add($loose)
        }
    }
    Find-MissingDependencies $mods
    return $mods
}

function Get-ReportFile {
    if ($ReportPath) { return $ReportPath }
    $dir = $PSScriptRoot
    if (-not $dir) { $dir = (Get-Location).Path }
    return (Join-Path $dir 'Mod Guardian Report.html')
}

Write-Host ''
Write-Host "  Mod Guardian $GuardianVersion - People Playground mod checker" -ForegroundColor Cyan
Write-Host '  Only reads files. Never changes or deletes anything.' -ForegroundColor DarkGray
Write-Host ''

$roots = Get-ScanRoots
if ($roots.Count -eq 0) {
    Write-Host "  Couldn't find People Playground's Mods or Workshop folder." -ForegroundColor Yellow
    Write-Host '  Run it with -Path "C:\path\to\People Playground\Mods" to point it there.' -ForegroundColor Yellow
    if (-not $NoPopup -and $OnWindows) {
        try {
            Add-Type -AssemblyName System.Windows.Forms
            [void][System.Windows.Forms.MessageBox]::Show("Mod Guardian couldn't find People Playground's Mods or Workshop folder.", 'Mod Guardian')
        } catch { }
    }
    exit 2
}
foreach ($r in $roots) { Write-Host "  Checking $($r.Kind): $($r.Path)" -ForegroundColor DarkGray }
Write-Host ''

$reportFile = Get-ReportFile
$mods = Invoke-Scan $roots
Write-ConsoleReport $mods
Write-HtmlReport $mods $roots $reportFile
Write-Host ''
Write-Host "  Report saved to: $reportFile" -ForegroundColor Cyan
Show-Popup $mods $reportFile

if ($Watch) {
    # Keep an eye on the folders and check any mod that gets added or changed.
    Write-Host ''
    Write-Host '  Watching for new or updated mods. Close this window to stop.' -ForegroundColor Cyan
    $known = @{}
    foreach ($m in $mods) { $known[$m.Folder] = $m.Worst }
    $watchers = @()
    foreach ($r in $roots) {
        $w = New-Object System.IO.FileSystemWatcher $r.Path
        $w.IncludeSubdirectories = $true
        $w.EnableRaisingEvents = $true
        $watchers += $w
    }
    while ($true) {
        $changed = $false
        foreach ($w in $watchers) {
            $res = $w.WaitForChanged([System.IO.WatcherChangeTypes]::All, 1000)
            if (-not $res.TimedOut) { $changed = $true }
        }
        if (-not $changed) { continue }
        Start-Sleep -Seconds 5   # let Steam finish writing the download
        $mods = Invoke-Scan $roots
        $fresh = @($mods | Where-Object { -not $known.ContainsKey($_.Folder) -or $known[$_.Folder] -ne $_.Worst })
        foreach ($m in $mods) { $known[$m.Folder] = $m.Worst }
        if ($fresh.Count -gt 0) {
            Write-Host ''
            Write-Host "  $(Get-Date -Format HH:mm) New or changed mods:" -ForegroundColor Cyan
            Write-ConsoleReport $fresh
            Write-HtmlReport $mods $roots $reportFile
            Show-Popup $fresh $reportFile
        }
    }
}

$worstOverall = 0
foreach ($m in $mods) { if ($LevelRank[$m.Worst] -gt $worstOverall) { $worstOverall = $LevelRank[$m.Worst] } }
if ($worstOverall -ge 3) { exit 1 }
exit 0
