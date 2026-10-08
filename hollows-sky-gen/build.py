"""Packs BP and RP into "Hollows Sky Gen.mcaddon". Run: python build.py"""
import pathlib, zipfile

here = pathlib.Path(__file__).parent
out = here / "Hollows Sky Gen.mcaddon"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for pack, name in (("BP", "Hollows Sky Gen BP"), ("RP", "Hollows Sky Gen RP")):
        for f in sorted((here / pack).rglob("*")):
            if f.is_file():
                z.write(f, f"{name}/{f.relative_to(here / pack).as_posix()}")
print(f"Made {out.name}")
