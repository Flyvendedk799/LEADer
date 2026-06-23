const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0b0f17"/>
  <path d="M16 44V14h8v23h24v7H16Z" fill="#38bdf8"/>
  <path d="M28 30h20v7H28v-7Zm0-16h20v7H28v-7Z" fill="#f8fafc"/>
</svg>`;

export function GET() {
  return new Response(FAVICON_SVG, {
    headers: {
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
