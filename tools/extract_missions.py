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
    """Return rows (list of column-lists) for the FIRST #section TSV block."""
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


def all_sections(data, name):
    """Return a list of row-lists for EVERY #section block with this name
    (some sections, e.g. #strategies, appear in multiple TextAssets)."""
    out = []
    for m in re.finditer(rb"#" + re.escape(name.encode()) + rb"[\t\r]", data):
        chunk = data[m.start():m.start() + 3_000_000].decode("utf-8", errors="replace")
        rows = []
        for line in chunk.split("\r\n")[1:]:
            if line.startswith("#end"):
                break
            rows.append(line.split("\t"))
        out.append(rows)
    return out


def build_story_chains(data, R, story_ids, name_of):
    """Reconstruct per-campaign story chains (order + branches + unlock conditions)
    from #questlines_* / #strategies + mission-id ordering."""
    # merge all #strategies blocks
    blocks = all_sections(data, "strategies")
    hdr = blocks[0][0]
    sidx = {n: i for i, n in enumerate(hdr) if n}

    def sg(r, n):
        i = sidx.get(n)
        return r[i].strip() if i is not None and i < len(r) else ""

    strat = {}
    for b in blocks:
        for r in b[1:]:
            if r and r[0].strip() and not r[0].startswith("#"):
                strat[r[0].strip()] = r

    def stname(s):
        return R(f"station.{s}.name") or s

    def facname(f):
        return R(f"faction.{f}.name") or f

    def translate(cond):
        toks = cond.split()
        out = []
        i = 0
        while i < len(toks):
            t = toks[i]
            if t in ("SFinishMission", "SFinishMissionAny") and i + 1 < len(toks):
                out.append(("finish", toks[i + 1], f"завершити «{name_of(toks[i + 1])}»")); i += 2
            elif t == "SStationDestroyed" and i + 1 < len(toks):
                out.append(("other", None, f"станцію «{stname(toks[i + 1])}» знищено")); i += 2
            elif t == "SMissionExists" and i + 1 < len(toks):
                out.append(("other", None, f"зʼявляється «{name_of(toks[i + 1])}»")); i += 2
            elif t == "SFactionPowerLessThan" and i + 1 < len(toks):
                out.append(("other", None, f"сила фракції «{facname(toks[i + 1])}» падає")); i += 2
            elif t == "IAwaitingDays" and i + 1 < len(toks):
                out.append(("other", None, f"очікування {toks[i + 1]} дн.")); i += 2
            elif t.startswith("FPower"):
                out.append(("other", None, "фракція набирає силу")); i += 1
            elif t == "SFaction":
                i += 2
            else:
                i += 1
        return out

    mission_cond = {}
    for sid, r in strat.items():
        for c in ("RunMissionsOnStart", "RunMissionsOnSuccess"):
            for mid in sg(r, c).split():
                if mid in story_ids:
                    conds = translate(sg(r, "WinConditions"))
                    keep, seen = [], set()
                    for kind, ref, txt in conds:
                        if kind == "finish" and ref == mid:
                            continue  # drop self-referential "finish this mission"
                        if txt not in seen:
                            seen.add(txt); keep.append(txt)
                    mission_cond[mid] = keep

    def parse(mid):
        parts = mid.split("_"); rest = parts[1:]; side = False
        if rest and rest[0] == "side":
            side = True; rest = rest[1:]
        num, branch = None, ""
        if rest:
            mm = re.match(r"^(\d+)([a-z]?)$", rest[0])
            if mm:
                num, branch = int(mm.group(1)), mm.group(2)
        return parts[0], num, branch, side

    grouped = {}
    for mid in story_ids:
        camp, num, branch, side = parse(mid)
        grouped.setdefault(camp, []).append((num if num is not None else 99, branch, side, mid))

    chains = {}
    for camp, its in grouped.items():
        its.sort(key=lambda x: (x[2], x[0], x[1]))
        tiers, curkey, cur = [], None, None
        for num, branch, side, mid in its:
            key = (side, num)
            if key != curkey:
                cur = {"tier": num, "side": side, "missions": []}
                tiers.append(cur); curkey = key
            cur["missions"].append({"id": mid, "name": name_of(mid), "branch": branch,
                                    "unlock": mission_cond.get(mid, [])})
        # branch tiers: clear per-node unlock (the branch marker conveys it)
        for t in tiers:
            if len(t["missions"]) > 1:
                for m in t["missions"]:
                    m["unlock"] = []
        chains[camp] = tiers
    return chains


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

    # ---- story chains (order / branches / unlock conditions) ----
    story_name = {m["id"]: m["name"] for m in story}
    story_ids = set(story_name)
    chains = build_story_chains(data, R, story_ids, lambda mid: story_name.get(mid) or mid)

    out = dict(generatedFrom="Quasimorph resources.assets (GameData DB)", lang="ru",
               missionTypeNames=type_name,
               counts=dict(story=len(story), proc=len(proc), total=len(story) + len(proc)),
               storyMissions=story, procMissions=proc, storyChains=chains)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"Wrote {out_path}: {len(story)} story + {len(proc)} proc = {len(story)+len(proc)} missions")

    # ---- weapons + faction reward tables (Phase 2 data) --------------------
    weapons_path = os.path.join(os.path.dirname(out_path), "weapons.json")
    extract_weapons(data, R, weapons_path)


def parse_damage(s):
    """'68 85 crit 2.1' -> (68, 85). Blank/malformed -> (0, 0)."""
    if not s:
        return 0, 0
    m = re.match(r"\s*(\d+)\s+(\d+)", s)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def extract_weapons(data, R, out_path):
    """Emit weapons.json with weapons list, per-faction reward tables, and
    a precomputed topByFaction ranking."""
    ranged = section(data, "rangeweapons") or []
    melee = section(data, "meleeweapons") or []

    def rows_to_weapons(rows, dmg_col, kind):
        if not rows:
            return []
        hdr = rows[0]
        def gi(name, default=None):
            return hdr.index(name) if name in hdr else default
        i_id, i_cat, i_tl, i_ic, i_wc, i_ws = (
            gi("Id"), gi("Categories"), gi("TechLevel"),
            gi("ItemClass"), gi("WeaponClass"), gi("WeaponSubClass"))
        out = []
        for r in rows[1:]:
            if not r or not r[0] or r[0].startswith("#"):
                continue
            wid = r[i_id].strip()
            item_class = r[i_ic].strip() if i_ic is not None and i_ic < len(r) else ""
            if item_class != "Weapon":
                continue
            # Skip relics/junk that pollute per-faction rankings
            if re.match(r"^(skull_|implicted_|trash_)", wid):
                continue
            dmg_raw = r[dmg_col].strip() if dmg_col < len(r) else ""
            dmin, dmax = parse_damage(dmg_raw)
            cats = (r[i_cat].strip().split() if i_cat is not None and i_cat < len(r) else [])
            out.append(dict(
                id=wid, name=R(f"item.{wid}.name") or wid, kind=kind,
                cls=(r[i_wc].strip() if i_wc is not None and i_wc < len(r) else ""),
                subcls=(r[i_ws].strip() if i_ws is not None and i_ws < len(r) else ""),
                tech=int(r[i_tl].strip() or "0") if i_tl is not None and i_tl < len(r) else 0,
                dmgMin=dmin, dmgMax=dmax, categories=cats
            ))
        return out

    weapons = rows_to_weapons(ranged, 16, "range") + rows_to_weapons(melee, 15, "melee")
    by_id = {w["id"]: w for w in weapons}

    # Faction reward tables — one #factiondrop_<F>_rewardEquipment per faction.
    fac_pat = re.compile(rb"#factiondrop_([A-Za-z]+)_rewardEquipment[\t\r]")
    faction_ids = sorted({m.group(1).decode() for m in fac_pat.finditer(data)})
    factionDrops = {}
    for fid in faction_ids:
        rows = section(data, f"factiondrop_{fid}_rewardEquipment")
        if not rows:
            continue
        entries = []
        for r in rows[1:]:
            if not r or not r[0] or r[0].startswith("#"):
                continue
            tech = int(r[0].strip() or "0")
            content_ids = r[1].strip().split() if len(r) > 1 else []
            pts = int(r[3].strip() or "0") if len(r) > 3 else 0
            for cid in content_ids:
                entries.append(dict(tech=tech, id=cid, points=pts))
        factionDrops[fid] = entries

    RANGED_PRECISION_CLASSES = {"MarksmanRifle", "AssaultRifle", "Shotgun", "SMG", "Pistol"}

    def top_for(fid, ranged_only=False):
        """Top-3 weapons for a faction, ranked by (dmgMax desc, tech asc)."""
        pool = [w for w in weapons
                if fid in w["categories"]
                and (not ranged_only or w["cls"] in RANGED_PRECISION_CLASSES)]
        pool.sort(key=lambda w: (-w["dmgMax"], w["tech"], w["id"]))
        return [dict(id=w["id"], name=w["name"], dmgMax=w["dmgMax"], tech=w["tech"],
                     cls=w["cls"], kind=w["kind"]) for w in pool[:3]]

    topByFaction = {fid: top_for(fid) for fid in faction_ids if any(fid in w["categories"] for w in weapons)}
    topByFactionRanged = {fid: top_for(fid, ranged_only=True) for fid in topByFaction}

    payload = dict(
        weapons=weapons,
        factionDrops=factionDrops,
        topByFaction=topByFaction,
        topByFactionRanged=topByFactionRanged
    )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"Wrote {out_path}: {len(weapons)} weapons, {len(factionDrops)} faction drop tables, "
          f"top computed for {len(topByFaction)} factions")


if __name__ == "__main__":
    main()
