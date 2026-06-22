export function discoveryMissionProviderLabel(mission: {
  provider?: string | null;
  lane?: { slug?: string | null } | null;
  log?: string[] | null;
}) {
  if (mission.provider && mission.provider !== "none") return mission.provider;
  const usedOfficialTenderIndex =
    mission.lane?.slug === "tenders-procurement" &&
    (mission.log ?? []).some((entry) => /udbud\.dk returned|official udbud\.dk index/.test(entry));
  if (usedOfficialTenderIndex) return "udbud.dk";
  return mission.provider ?? null;
}

export function discoveryMissionDisplayWarnings(
  mission: {
    provider?: string | null;
    lane?: { slug?: string | null } | null;
    log?: string[] | null;
  },
  warnings: string[] = [],
) {
  if (discoveryMissionProviderLabel(mission) !== "udbud.dk") return warnings;
  return warnings.filter((warning) => !/No web search API key configured/i.test(warning));
}
