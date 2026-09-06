export interface RankedParticipant {
  identity: string;
  camera: boolean;
  local: boolean;
}

export class SpeakerOrder {
  top: string | null = null;
  private candidate: string | null = null;
  private candidateSince = 0;
  private promotedAt = -Infinity;
  private recent = new Map<string, number>();
  private joined = new Map<string, number>();

  update(active: string[], now: number) {
    const candidate = active[0] ?? null;
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      this.candidateSince = now;
    }
    if (
      candidate &&
      now - this.candidateSince >= 800 &&
      now - this.promotedAt >= 2000
    ) {
      this.recent.set(candidate, now);
      if (this.top !== candidate) {
        this.top = candidate;
        this.promotedAt = now;
      }
    }
  }

  sort<T extends RankedParticipant>(participants: T[]): T[] {
    const present = new Set(participants.map((p) => p.identity));
    for (const id of this.joined.keys()) {
      if (!present.has(id)) {
        this.joined.delete(id);
        this.recent.delete(id);
      }
    }
    if (this.top && !present.has(this.top)) {
      this.top = null;
    }
    for (const p of participants) {
      if (!this.joined.has(p.identity)) {
        this.joined.set(p.identity, this.joined.size);
      }
    }
    const rank = (p: T) =>
      p.identity === this.top
        ? 0
        : this.recent.has(p.identity)
        ? 1
        : p.camera
        ? 2
        : 3;
    return [...participants].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (this.recent.get(b.identity) ?? 0) -
          (this.recent.get(a.identity) ?? 0) ||
        (this.joined.get(a.identity) ?? 0) -
          (this.joined.get(b.identity) ?? 0) ||
        a.identity.localeCompare(b.identity),
    );
  }
}

export function railLayout(width: number, height: number, sidebarWidth = 0) {
  const usableWidth = Math.max(0, width - sidebarWidth);
  const compact = usableWidth < 600;
  const tileWidth = compact
    ? Math.max(112, Math.min(152, usableWidth * 0.34))
    : Math.min(280, Math.max(180, usableWidth * 0.19));
  const availableHeight = Math.max(0, height - 190);
  const slots = compact
    ? 1
    : Math.max(1, Math.floor(availableHeight / ((tileWidth * 9) / 16 + 8)));
  return { tileWidth, slots, compact, right: sidebarWidth + 12 };
}
