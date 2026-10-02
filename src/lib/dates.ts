// Denmark-first: "9am" always means 9am Copenhagen, whatever timezone the server runs in.
const WORKFLOW_TIME_ZONE = "Europe/Copenhagen";

const zoneParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: WORKFLOW_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedFields(date: Date) {
  const parts: Record<string, number> = {};
  for (const part of zoneParts.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts;
}

/** 09:00 Copenhagen time on the given Copenhagen calendar day (month is 1-based, overflow normalises). */
function nineOnDay(year: number, month: number, day: number) {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, 9, 0, 0, 0);
  let instant = wallClockAsUtc;
  // Two passes settle the UTC offset, including across DST changes.
  for (let i = 0; i < 2; i += 1) {
    const f = zonedFields(new Date(instant));
    const shownAsUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
    instant += wallClockAsUtc - shownAsUtc;
  }
  return new Date(instant);
}

/** 09:00 Copenhagen time on the Copenhagen calendar day of `date`, shifted by `dayOffset` days. */
export function nineAmCopenhagen(date: Date, dayOffset = 0) {
  const f = zonedFields(date);
  return nineOnDay(f.year, f.month, f.day + dayOffset);
}
