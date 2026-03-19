declare module "pg" {
  export interface QueryResult<Row = unknown> {
    rows: Row[];
  }

  export interface Notification {
    payload?: string;
  }

  export class Pool {
    constructor(config: { connectionString: string; max?: number });
    query<Row = unknown>(queryText: string, values?: unknown[]): Promise<QueryResult<Row>>;
    end(): Promise<void>;
  }

  export class Client {
    constructor(config: { connectionString: string });
    connect(): Promise<void>;
    query<Row = unknown>(queryText: string, values?: unknown[]): Promise<QueryResult<Row>>;
    end(): Promise<void>;
    on(event: "notification", listener: (message: Notification) => void): this;
    on(event: "error", listener: (error: unknown) => void): this;
    on(event: "end", listener: () => void): this;
    removeAllListeners(event?: string | symbol): this;
  }
}
