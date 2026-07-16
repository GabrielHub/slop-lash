export function buildRoomCapabilityLink(baseUrl: string, capability: string): string {
  const url = new URL(baseUrl);
  url.hash = new URLSearchParams({ capability }).toString();
  return url.toString();
}

export function readRoomCapabilityFragment(hash: string): string | null {
  const capability = new URLSearchParams(hash.replace(/^#/u, "")).get("capability");
  return capability && capability.trim().length > 0 ? capability : null;
}

export function clearRoomCapabilityFromUrl(url: URL): URL {
  url.searchParams.delete("capability");
  const fragment = new URLSearchParams(url.hash.replace(/^#/u, ""));
  fragment.delete("capability");
  url.hash = fragment.size > 0 ? fragment.toString() : "";
  return url;
}
