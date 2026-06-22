export function isBroadFrameworkTender(text: string) {
  const normalized = text.toLowerCase();
  if (!/rammeaftale|rammekontrakt|framework agreement|framework contract/.test(normalized)) return false;

  return /it-konsulentydelser|konsulentydelser|rådgivningsydelser|raadgivningsydelser|consultancy services?|consultant services?|levering af (?:it-)?konsulentydelser|levering af ydelser|ydelser inden for|penetrationstest|sikkerhedstest|\bgis\b|arkitektur|projektledelse/.test(
    normalized,
  );
}
