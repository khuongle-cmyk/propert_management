export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function publicSpaceUrlSegment(space: { id: string; name: string }): string {
  const base = slugify(space.name) || "space";
  return `${base}--${space.id}`;
}

export function parseSpaceIdFromSegment(segment: string): string | null {
  const idx = segment.lastIndexOf("--");
  if (idx === -1) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)) {
      return segment;
    }
    return null;
  }
  const id = segment.slice(idx + 2);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  return id;
}
