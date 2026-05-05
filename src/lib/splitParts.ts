export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function partSortKey(name: string): number {
  const mp = name.match(/part(\d{2})\.zip$/i);
  if (mp) return parseInt(mp[1], 10);
  const m = name.match(/\.z(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  if (name.toLowerCase().endsWith('.zip')) return 0;
  return 999;
}

export type SplitPartDownload = {
  type: string;
  name: string;
  path: string;
  sha: string;
  size?: number;
};

export function listSplitPartFiles(
  archiveItemPath: string,
  downloads: SplitPartDownload[]
): SplitPartDownload[] {
  const baseStem = archiveItemPath.replace(/\.[^/.]+$/, '');
  const stemSlash = baseStem.lastIndexOf('/');
  const stemParent = stemSlash > 0 ? baseStem.slice(0, stemSlash) : '';
  const baseName = baseStem.split('/').pop() || baseStem;
  const safe = escapeRegex(baseName);
  const splitSpanRe = new RegExp(`^${safe}\\.z[0-9]+$`, 'i');
  const partChunkRe = new RegExp(`^${safe}part[0-9]{2}\\.zip$`, 'i');
  return downloads
    .filter((d) => {
      if (d.type !== 'file') return false;
      if (stemParent) {
        const di = d.path.lastIndexOf('/');
        const dParent = di > 0 ? d.path.slice(0, di) : d.path;
        if (dParent !== stemParent) return false;
      }
      return d.name === `${baseName}.zip` || splitSpanRe.test(d.name) || partChunkRe.test(d.name);
    })
    .sort((a, b) => partSortKey(a.name) - partSortKey(b.name));
}
