#!/usr/bin/env python3
"""
Extract AUTHENTIC game sprites (faction icons, item icons, portraits, UI glyphs)
from Quasimorph's Unity assets into assets/game-icons/ as PNG files.

Run this on a machine WITH network access so UnityPy can be installed — the cloud
sandbox used to build this app blocks both the npm and PyPI registries, so real
sprite extraction has to happen on your Windows box.

    pip install UnityPy Pillow

    # 1) First list every sprite/texture name (writes a manifest, exports nothing):
    python tools/extract_icons.py "D:/SteamLibrary/steamapps/common/Quasimorph/Quasimorph_Data"

    # 2) Then export the ones you want by keyword (case-insensitive substring match):
    python tools/extract_icons.py "D:/SteamLibrary/steamapps/common/Quasimorph/Quasimorph_Data" faction emblem portrait icon

Exported PNGs land in assets/game-icons/. The app currently uses hand-drawn SVG
emblems (src/icons.js); once you have real PNGs you can point the UI at them.
"""
import os
import sys

try:
    import UnityPy
except ImportError:
    sys.exit("UnityPy is not installed. Run:  pip install UnityPy Pillow")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    data_dir = sys.argv[1]
    filters = [a.lower() for a in sys.argv[2:]]
    out_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "game-icons")
    os.makedirs(out_dir, exist_ok=True)

    asset_files = [
        os.path.join(data_dir, f) for f in os.listdir(data_dir)
        if f.endswith(".assets")
    ]

    names = []
    exported = 0
    for fp in asset_files:
        try:
            env = UnityPy.load(fp)
        except Exception as e:
            print(f"  skip {os.path.basename(fp)}: {e}")
            continue
        for obj in env.objects:
            if obj.type.name not in ("Sprite", "Texture2D"):
                continue
            try:
                d = obj.read()
            except Exception:
                continue
            nm = getattr(d, "m_Name", "") or getattr(d, "name", "")
            if not nm:
                continue
            names.append(nm)
            if filters and any(k in nm.lower() for k in filters):
                try:
                    img = d.image  # PIL.Image for Sprite/Texture2D
                    safe = "".join(c if (c.isalnum() or c in "-_.") else "_" for c in nm)
                    img.save(os.path.join(out_dir, safe + ".png"))
                    exported += 1
                except Exception as e:
                    print(f"  cannot export {nm}: {e}")

    names = sorted(set(names))
    with open(os.path.join(out_dir, "_manifest.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(names))

    print(f"Scanned {len(asset_files)} asset files; "
          f"{len(names)} unique sprite/texture names -> assets/game-icons/_manifest.txt")
    if filters:
        print(f"Exported {exported} PNG(s) matching {filters} -> assets/game-icons/")
    else:
        print("No keyword filters given, so nothing was exported. "
              "Open _manifest.txt, then re-run with keywords, e.g.:\n"
              '  python tools/extract_icons.py "<...>/Quasimorph_Data" faction portrait')


if __name__ == "__main__":
    main()
