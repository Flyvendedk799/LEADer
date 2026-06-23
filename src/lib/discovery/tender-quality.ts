export function isBroadFrameworkTender(text: string) {
  const normalized = text.toLowerCase();
  if (!/rammeaftale|rammekontrakt|framework agreement|framework contract/.test(normalized)) return false;

  return /it-konsulentydelser|konsulentydelser|rådgivningsydelser|raadgivningsydelser|consultancy services?|consultant services?|levering af (?:it-)?konsulentydelser|levering af ydelser|ydelser inden for|penetrationstest|sikkerhedstest|\bgis\b|arkitektur|projektledelse/.test(
    normalized,
  );
}

export function hasConcreteSoftwareTenderScope(text: string) {
  const normalized = text.toLowerCase();

  if (/\b(?:48|72)\d{6}\b/.test(normalized)) return true;

  return /it-tjenester|it-ydelser|programmel|software|saas|cloud|hosting|system- og support|supporttjenester|driftsstyringssystem|it-driftsstyringssystem|it-løsning|it-loesning|it-system|intranet|extranet|webshop|webapp|\bapp\b|applikation|hjemmeside|digital(?:e|t)? (?:platform|værktøj|vaerktoej|løsning|loesning)|database|dataflow|api|integration|devops|sql|c#|java|linux|kunstig intelligens|automatisering|ruteplanlægning|ruteplanlaegning/.test(
    normalized,
  );
}
