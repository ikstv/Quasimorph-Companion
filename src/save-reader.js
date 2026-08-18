/* Normalize a raw Quasimorph save (as returned by window.QM.getSave) into a
   compact shape the renderer can project. All source fields are numeric strings
   in the game's JSON; parse defensively — never throw to the UI. */
(function () {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const bool = (v) => v === true || v === 'True' || v === 'true';
  const componentsMap = (session) => {
    const out = {};
    for (const c of (session?.Components || [])) out[c.Type] = c.Content;
    return out;
  };

  function normalize(raw) {
    if (!raw || !raw.ok) {
      return { ok: false, reason: raw?.reason || 'unknown', dir: raw?.dir };
    }
    const c = componentsMap(raw.session);

    // Difficulty ---------------------------------------------------------------
    const diffPreset = c['MGSC.Difficulty']?.Preset || {};
    const difficulty = diffPreset.Id || 'Unknown';
    const tutorialActive = bool(diffPreset.Tutorial);
    const passedTriggersArr = c['MGSC.StoryTriggers']?.PassedTriggers || [];
    const passedTriggers = new Set(passedTriggersArr);
    const tutorialFinished = passedTriggers.has('Finish_Tutorial');

    // Factions -----------------------------------------------------------------
    const facValues = c['MGSC.Factions']?.Values || [];
    const lockedSet = new Set(c['MGSC.Factions']?.LockedFactions || []);
    const factions = facValues.map(f => ({
      id: f.Id,
      reputation: num(f.PlayerReputation),
      techLevel: num(f.CurrentTechLevel),
      questlineId: (typeof f.QuestlineId === 'string' && f.QuestlineId) ? f.QuestlineId : null,
      locked: lockedSet.has(f.Id)
    }));

    // Live missions ------------------------------------------------------------
    const missionsArr = c['MGSC.Missions']?.Values || [];
    const now = Date.now();
    const liveMissions = missionsArr.map(m => {
      const rewardItemIds = [];
      for (const it of (m.RewardItems || [])) {
        const id = it?.Content?.Id;
        if (id) rewardItemIds.push({
          id,
          count: num(it.Content.StackCount) || 1,
          isWeapon: (it.Content._components || []).some(x => x?.Type === 'MGSC.WeaponComponent')
        });
      }
      return {
        storyId: m.StoryId,
        stationId: m.StationId,
        isStory: bool(m.IsStoryMission),
        procType: m.ProcMissionType || null,
        benId: m.BeneficiaryFactionId,
        vicId: m.VictimFactionId,
        benDelta: num(m.BeneficiaryReputationDelta),
        vicDelta: num(m.VictimReputationDelta),
        rewardPoints: num(m.OriginalRewardPoints),
        difficulty: num(m.MissionDifficulty),
        minTech: num(m.MinTechLevel),
        rewardItems: rewardItemIds,
        expireTime: num(m.ExpireTime),
        isBlocked: bool(m.IsBlocked)
      };
    });

    // Completed story missions -------------------------------------------------
    const completedStoryIds = new Set(c['MGSC.StoryTriggers']?.FinishedStoryMissions || []);

    // Inventory ----------------------------------------------------------------
    const cargo = c['MGSC.MagnumCargo'] || {};
    const unlockedProduction = new Set(cargo.UnlockedProductionItems || []);

    return {
      ok: true,
      saveVersion: raw.session?.SaveVersion,
      isInDungeon: bool(raw.session?.IsInDungeon),
      difficulty,
      tutorialActive,
      tutorialFinished,
      factions,
      liveMissions,
      passedTriggers,
      completedStoryIds,
      inventory: { unlockedProduction }
    };
  }

  window.QM_SAVE = { normalize };
})();
