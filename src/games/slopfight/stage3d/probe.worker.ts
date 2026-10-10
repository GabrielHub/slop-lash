// Foundation PROBE: proves Turbopack bundles a module worker beside the lazy Stage.

self.onmessage = (event: MessageEvent<string>) => {
  self.postMessage(`pong (${event.data})`);
};
