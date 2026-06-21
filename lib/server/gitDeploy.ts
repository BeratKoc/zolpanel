export function isSafeRepoUrl(url: string): boolean {
  return typeof url === 'string' && /^https:\/\/[\w.@:/~-]+$/.test(url) && !url.includes(' ');
}
