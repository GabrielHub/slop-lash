/** A small FIFO for async work. When full, the stalest waiting item is dropped. */
export class BoundedSerialQueue<T> {
  private readonly pending: T[] = [];
  private processing = false;

  constructor(
    private readonly maxPending: number,
    private readonly process: (item: T) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {
    if (!Number.isInteger(maxPending) || maxPending < 1) {
      throw new Error("BoundedSerialQueue maxPending must be a positive integer");
    }
  }

  enqueue(item: T): T | undefined {
    const dropped = this.pending.length >= this.maxPending ? this.pending.shift() : undefined;
    this.pending.push(item);
    void this.drain();
    return dropped;
  }

  clear(): void {
    this.pending.length = 0;
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      let item = this.pending.shift();
      while (item !== undefined) {
        try {
          await this.process(item);
        } catch (error) {
          this.onError(error);
        }
        item = this.pending.shift();
      }
    } finally {
      this.processing = false;
    }
  }
}
