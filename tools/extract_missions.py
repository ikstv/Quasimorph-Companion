#!/usr/bin/env python3
"""
Extract every Quasimorph mission (story + procedural) from the game's data files
into data/missions.json.

Usage:
    python tools/extract_missions.py "<path to>/Quasimorph/Quasimorph_Data/resources.assets"

The game stores its whole database as sectioned TSV blocks inside resources.assets
(sections like #storymissions, #stations, #alliances, ...) plus one big localization
TSV table (key + one column per language). This script parses those directly — no
Unity asset tooling required.
"""
import re
import json
import os
import sys

RU_COL = 2  # localization columns: 0=key,1=English,2=Russian,3=German,...


def load(path):
    with open(path, "rb") as f:
        return f.read()


def load_localization(data):
    """Return {key: [columns...]} for the big localization TSV table."""
    def istext(b):
        return b in (9, 10, 13) or 32 <= b < 127 or b >= 128

    p = data.find(b"story.civ_1_manifesto.name")
    if p < 0:
        raise SystemExit("localization anchor not found — is this resources.assets?")
    lo = p
    while lo > 0 and istext(data[lo - 1]):
        lo -= 1
    hi = p
    n = len(data)
    while hi < n and istext(data[hi]):
        hi += 1
    loc = {}
    for line in data[lo:hi].decode("utf-8", errors="replace").split("\r\n"):
        cols = line.split("\t")
        if len(cols) > 2 and cols[0]:
            loc[cols[0]] = cols
    return loc


def section(data, name):
    """Return rows (list of column-lists) for a #section TSV block."""
    m = re.search(rb"#" + re.escape(name.encode()) + rb"[\t\r]", data)
    if not m:
        return None
    chunk = data[m.start():m.start() + 3_000_000].decode("utf-8", errors="replace")
    rows = []
    for line in chunk.split("\r\n")[1:]:
        if line.startswith("#end"):
            break
        rows.append(line.split("\t"))
    return rows


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    assets = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "missions.json")

    data = load(assets)
    loc = load_localization(data)

    def R(key):
        c = loc.get(key)
        return c[RU_COL].strip() if c and len(c) > RU_COL else ""

    def col(r, i):
        return r[i].strip() if len(r) > i else ""

    def fac(fid):
        fid = fid.strip()
        return {"id": fid, "name": R(f"faction.{fid}.name") or fid,
                "desc": R(f"faction.{fid}.desc")} if fid else None

    def sta(sid):
        sid = sid.strip()
        return {"id": sid, "name": R(f"station.{sid}.name") or sid,
                "desc": R(f"station.{sid}.desc")} if sid else None

    def items(s):
        return [{"id": i, "name": R(f"item.{i}.name") or i} for i in s.split()]

    def texts(prefix):
        objs = [R(f"{prefix}.objective{i}") for i in range(8)]
        stages = [R(f"{prefix}.stage{i}.name") for i in range(1, 12)]
        return dict(briefing=R(f"{prefix}.briefing"), desc=R(f"{prefix}.desc"),
                    details=R(f"{prefix}.details"), after=R(f"{prefix}.after"),
                    objectives=[o for o in objs if o], stages=[s for s in stages if s])

    CAMP = {"tutorial": "Навчання", "xio": "Xiomara Masks", "anc": "AnCom", "hiv": "Hive",
            "rwa": "RealWare", "civ": "Civil Resistance", "tez": "Tezctlan", "unc": "Unchained Belt"}
    NAME_FALLBACK = {"tutorial_1_defense": "Оборона"}

    # ---- story missions ----
    sm = section(data, "storymissions")
    story = []
    for r in sm[1:]:
        mid = col(r, 0)
        if not mid:
            continue
        key = mid.split("_")[0]
        story.append(dict(id=mid, type="story", campaignKey=key, campaign=CAMP.get(key, key),
            name=R(f"story.{mid}.name") or NAME_FALLBACK.get(mid, mid), **texts(f"story.{mid}"),
            station=sta(col(r, 1)), beneficiaryFaction=fac(col(r, 2)), victimFaction=fac(col(r, 3)),
            questlineOwner=fac(col(r, 4)), prizeItems=items(col(r, 5)),
            winCondition=col(r, 6), winConditionParameters=col(r, 7),
            minTechLevel=col(r, 9), shownDifficulty=col(r, 17), factionIdsByStages=col(r, 13)))

    # ---- mission-type names ----
    TYPES = ["RaiderCapture", "Defense", "Elimination", "Sabotage", "Espionage", "Robbery",
             "Ritual", "Escort", "Infiltration", "Control", "Counterattack", "Security",
             "BramfaturaInvasion", "CEOElimination"]
    type_name = {t: (R(f"missiontype.{t}.name") or t) for t in TYPES}
    FT_GLOSS = {"CivilRes": "Сопротивление", "Corp": "Корпорации", "Pirates": "Пираты",
                "Shedu": "Тысяча Шеду", "Tezctlan": "Тескатлан", "Xiomara": "Маски Ксиомары"}

    def ftname(x):
        for k in (f"factiontype.{x}.name", f"faction.{x}.name", f"alliance.{x}.name"):
            v = R(k)
            if v:
                return v
        return FT_GLOSS.get(x, x)

    # ---- procedural (non-story) narrative missions from mission.* keys ----
    roots = {}
    for k in loc:
        if k.startswith("mission."):
            parts = k.split(".")
            if len(parts) >= 3:
                roots.setdefault(parts[1], set()).add(".".join(parts[2:]))
    real = [r for r in roots if {"briefing", "desc", "name", "details"} & roots[r]]
    pat = re.compile(r"^([A-Za-z]+)_([A-Za-z]+)_([A-Za-z]+?)(\d+)$")
    special = {"BramfaturaInvasion": "Погружение", "CEO_Eilimination": "Устранение CEO"}
    proc = []
    for root in sorted(real):
        m = pat.match(root)
        t = texts(f"mission.{root}")
        if m:
            giver, victim, mtype, var = m.group(1), m.group(2), m.group(3), int(m.group(4))
            mtn = type_name.get(mtype, mtype)
            proc.append(dict(id=root, type="proc", missionType=mtype, missionTypeName=mtn,
                giver=giver, giverName=ftname(giver), victim=victim, victimName=ftname(victim),
                variant=var, name=(R(f"mission.{root}.name") or mtn), **t))
        else:
            nm = special.get(root) or R(f"mission.{root}.name") or R(f"missiontype.{root}.name") or root
            proc.append(dict(id=root, type="proc", missionType=root, missionTypeName=nm,
                giver="", giverName="", victim="", victimName="", variant=0, name=nm, **t))

    out = dict(generatedFrom="Quasimorph resources.assets (GameData DB)", lang="ru",
               missionTypeNames=type_name,
               counts=dict(story=len(story), proc=len(proc), total=len(story) + len(proc)),
               storyMissions=story, procMissions=proc)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"Wrote {out_path}: {len(story)} story + {len(proc)} proc = {len(story)+len(proc)} missions")


if __name__ == "__main__":
    main()
