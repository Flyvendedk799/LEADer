export function researchSearchHref(prompt: string) {
  const query = prompt.replace(/\s+/g, " ").trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function uniqueResearchPrompts(prompts: unknown, limit = 5) {
  if (!Array.isArray(prompts)) return [];
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of prompts) {
    if (typeof item !== "string") continue;
    const prompt = item.replace(/\s+/g, " ").trim();
    const key = prompt.toLowerCase();
    if (!prompt || seen.has(key)) continue;
    seen.add(key);
    values.push(prompt);
    if (values.length >= limit) break;
  }
  return values;
}
