type MockEventPayload = unknown;

export class MockEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = MockEventSource.CONNECTING;
  readonly OPEN = MockEventSource.OPEN;
  readonly CLOSED = MockEventSource.CLOSED;
  readonly url: string;
  readonly withCredentials = false;
  readyState = MockEventSource.CONNECTING;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent<string>) => unknown) | null = null;
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
  private cleanup: (() => void) | null = null;

  constructor(url: string | URL) {
    super();
    this.url = new URL(url, window.location.origin).toString();
  }

  close() {
    if (this.readyState === MockEventSource.CLOSED) return;
    this.readyState = MockEventSource.CLOSED;
    this.cleanup?.();
    this.cleanup = null;
  }

  setCleanup(cleanup: (() => void) | null) {
    this.cleanup = cleanup;
  }

  open() {
    if (this.readyState === MockEventSource.CLOSED) return;
    this.readyState = MockEventSource.OPEN;
    const event = new Event("open");
    this.onopen?.call(this as unknown as EventSource, event);
    this.dispatchEvent(event);
  }

  fail() {
    if (this.readyState === MockEventSource.CLOSED) return;
    const event = new Event("error");
    this.onerror?.call(this as unknown as EventSource, event);
    this.dispatchEvent(event);
    this.close();
  }

  emit(type: string, payload: MockEventPayload) {
    if (this.readyState === MockEventSource.CLOSED) return;
    const event = new MessageEvent(type, { data: JSON.stringify(payload) });
    if (type === "message") {
      this.onmessage?.call(this as unknown as EventSource, event);
    }
    this.dispatchEvent(event);
  }
}
