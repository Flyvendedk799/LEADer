export function isBroadFrameworkTender(text: string) {
  const normalized = text.toLowerCase();
  if (
    !/rammeaftale|rammekontrakt|framework (?:service )?agreements?|framework (?:service )?contracts?/.test(
      normalized,
    )
  )
    return false;

  return /it-konsulentydelser|konsulentydelser|rådgivningsydelser|raadgivningsydelser|consultancy services?|consultant services?|levering af (?:it-)?konsulentydelser|levering af ydelser|ydelser inden for|penetrationstest|sikkerhedstest|\bgis\b|arkitektur|projektledelse/.test(
    normalized,
  );
}

export function isResearchPolicyTender(text: string) {
  const normalized = text.toLowerCase();
  const researchOrPolicy =
    /topic centre|cpv:\s*73000000|forsknings- og udviklingsvirksomhed|research and development|methodological|analytical work|knowledge services?|reported under regulation|regulation\s*\(eu\)|environmental impacts?|transport sector/.test(
      normalized,
    );
  if (!researchOrPolicy) return false;

  return !/levering(?:, drift, vedligeholdelse og support)? af|levering og implementering|implementering af|it-løsning|it-loesning|it-system|driftsstyringssystem|hostet servermiljø|servermiljø|ruteplanlægning|ruteplanlaegning|intranet|webshop|webapp|applikation|digital(?:e|t)? (?:platform|værktøj|vaerktoej|løsning|loesning)/.test(
    normalized,
  );
}

export function hasConcreteSoftwareTenderScope(text: string) {
  // CPV 48/72 marks an IT notice. The bare 72000000 code is stripped below because
  // many unrelated notices carry it, so the IT classification is remembered first.
  const itClassified = /cpv:\s*(?:48|72)\d{6}/.test(text.toLowerCase());
  const normalized = text
    .toLowerCase()
    .replace(/(?:undtagen|except|excluding)\s+(?:programmel|software)/g, "")
    .replace(
      /cpv:\s*72000000[^.\n]*?(?=formulartype|bekendtgørelsestype|$)/g,
      "",
    );
  // A notice classified outside IT (equipment, meters, cameras, vehicles...) is only
  // software work when it asks for development or a hosted service, not when it
  // merely mentions software as part of delivering equipment.
  const mainCpv = text.toLowerCase().match(/cpv:\s*(\d{8})/)?.[1];
  if (
    mainCpv &&
    !/^(?:48|72|64|79)/.test(mainCpv) &&
    !/udvikling af|software.?udvikling|development of|\bsaas\b|software as a service|applikationsdrift|videreudvikling|custom software|bespoke/.test(
      normalized,
    )
  ) {
    return false;
  }

  const hardwareLed =
    /ladestandere|ladeinfrastruktur|kaldeanlæg|nødkald|patientovervågning|medical equipment|charging stations|it-arbejdspladser|servicedesk|enhedsadministration/.test(
      normalized,
    );
  if (
    hardwareLed &&
    !/udvikling af (?:en |et )?(?:software|applikation|webapp)|bespoke software|custom software development/.test(
      normalized,
    )
  )
    return false;

  if (
    /\b48\d{6}\b|\b722\d{5}\b|\b724\d{5}\b|\b725\d{5}\b|\b726\d{5}\b|\b727\d{5}\b|\b728\d{5}\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    itClassified &&
    /\bsystem(?:s|er)?\b|\w{3,}system(?:er)?\b|platform|solution|løsning|loesning|application|portal|værktøj|vaerktoej/.test(
      normalized,
    )
  ) {
    return true;
  }

  return /programmel|software|saas|cloud|hosting|system- og support|supporttjenester|driftsstyringssystem|it-driftsstyringssystem|it-løsning|it-loesning|it-system|intranet|extranet|webshop|webapp|\bapp\b|applikation|hjemmeside|digital(?:e|t)? (?:platform|værktøj|vaerktoej|løsning|loesning)|database|dataflow|\bapi\b|integration|devops|\bsql\b|c#|\bjava\b|\blinux\b|kunstig intelligens|automatisering|ruteplanlægning|ruteplanlaegning/.test(
    normalized,
  );
}
