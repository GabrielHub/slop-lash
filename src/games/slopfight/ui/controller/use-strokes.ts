"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../../../convex/_generated/api";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import { useRoom } from "@/room/context";
import {
  doodleRoom,
  fitDoodleStroke,
  strokesByLayer,
  type Stroke,
  type StrokeBatch,
} from "../../strokes";
import {
  applyLocal,
  enqueueClear,
  enqueueStroke,
  enqueueUndo,
  nextSeq,
  takeOp,
  type QueueItem,
  type QueueOp,
} from "./logic";
import { useSlopfight } from "./shared";

// The phone's side of live drawing. The canvas shows the local strokes at
// once; a queue mirrors every stroke, undo and clear to the server in order:
// finished strokes coalesced to at most 4 `addStrokes` calls a second with
// increasing `seq` (a retried batch keeps its seq, so it is a no-op if it
// already landed), retried with backoff on transport errors. On mount the
// layer is restored from the server, so a reload or a reconnect keeps the
// drawing. The room view carries no strokes while a game runs (build plan
// decision 5), so the phone reads its own once from `play.myStrokes` (only
// this seat's rows, up to this layer); a view that does carry them
// (`doodles`, as in the fixtures) is used instead.

const RETRY_LIMIT = 5;
const RETRY_BASE_MS = 400;

type Inflight = { op: QueueOp; seq: number | null; attempt: number };

export interface StrokeSync {
  /** This layer's strokes, as drawn (optimistic). */
  strokes: Stroke[];
  /** Earlier layers, for the faded underlay. */
  below: Stroke[];
  /** False until the layer has been restored from the server. */
  ready: boolean;
  /** This layer has reached its stroke or point budget; Undo and Clear still work. */
  full: boolean;
  /** A save that failed for good (the phase moved on, the canvas is full). */
  error: string | null;
  add: (stroke: Stroke) => void;
  undo: () => void;
  clear: () => void;
  /** Resolves once every stroke, undo and clear has reached the server. */
  flush: () => Promise<boolean>;
}

interface StrokeRow {
  fighterId: string;
  layer: number;
  seq: number;
  strokes: readonly { c: number; w: number; p: number[] }[];
}

/** One fighter's rows split into this layer, the layers under it, and the layer's highest seq. */
function split(rows: readonly StrokeRow[], fighterId: string | null, layer: number) {
  const mine = rows.filter((row) => row.fighterId === fighterId) as unknown as (StrokeBatch &
    StrokeRow)[];
  const layers = strokesByLayer(mine);
  return {
    strokes: layers.find((group) => group.layer === layer)?.strokes ?? [],
    below: layers.filter((group) => group.layer < layer).flatMap((group) => group.strokes),
    lastSeq: Math.max(0, ...mine.filter((row) => row.layer === layer).map((row) => row.seq)),
  };
}

export function useStrokeSync(layer: number): StrokeSync {
  const { run, capability } = useRoom();
  const mode = useSlopfight();
  const convex = useConvex();
  const fighterId = mode.myFighterId;

  const items = useRef<QueueItem[]>([]);
  const inflight = useRef<Inflight | null>(null);
  const lastAddAt = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const waiters = useRef<((ok: boolean) => void)[]>([]);
  const failed = useRef(false);
  const alive = useRef(true);

  // Restore once per mount: from the view's doodles when it has them (no
  // fetch), else one read of this seat's own strokes. Without a fighter or a
  // seat there is nothing to restore.
  const [restored] = useState(() =>
    mode.doodles
      ? split(mode.doodles, fighterId, layer)
      : fighterId && capability
        ? null
        : split([], null, layer),
  );
  const [strokes, setStrokes] = useState<Stroke[]>(restored?.strokes ?? []);
  const local = useRef(restored?.strokes ?? []);
  const [below, setBelow] = useState<Stroke[]>(restored?.below ?? []);
  const [ready, setReady] = useState(restored !== null);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef(restored?.lastSeq ?? 0);

  useEffect(() => {
    if (restored || !capability) return;
    let cancelled = false;
    convex
      .query(api.slopfight.play.myStrokes, { capability, layer })
      .then((rows) => {
        if (cancelled) return;
        const layers = split(rows, fighterId, layer);
        local.current = layers.strokes;
        setStrokes(layers.strokes);
        setBelow(layers.below);
        lastSeq.current = Math.max(lastSeq.current, layers.lastSeq);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        // A failed read says nothing about the saved sketch. Never replace it
        // with a blank local canvas that could later overwrite or forge it.
        failed.current = true;
        setError("Couldn't restore your drawing. Reload to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [capability, convex, fighterId, layer, restored]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
      const pending = waiters.current;
      waiters.current = [];
      for (const resolve of pending) resolve(false);
    };
  }, []);

  // The queue's driver reads the latest runner and layer through a ref, so its
  // callbacks stay stable for the canvas.
  const context = useRef({ run, layer });
  useEffect(() => {
    context.current = { run, layer };
  }, [run, layer]);

  const driver = useRef<{
    pump: () => void;
    send: () => Promise<void>;
    settle: (ok: boolean) => void;
  } | null>(null);
  driver.current ??= {
    settle(ok) {
      const pending = waiters.current;
      waiters.current = [];
      for (const resolve of pending) resolve(ok);
    },
    pump() {
      const self = driver.current!;
      if (!alive.current || inflight.current || failed.current) return;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      const now = Date.now();
      const { op, rest, waitMs } = takeOp(items.current, lastAddAt.current, now);
      if (!op) {
        if (waitMs > 0) timer.current = window.setTimeout(self.pump, waitMs);
        else self.settle(true);
        return;
      }
      items.current = rest;
      let seq: number | null = null;
      if (op.kind === "add") {
        seq = nextSeq(lastSeq.current, now);
        lastSeq.current = seq;
        lastAddAt.current = now;
      }
      inflight.current = { op, seq, attempt: 0 };
      void self.send();
    },
    async send() {
      const self = driver.current!;
      const current = inflight.current;
      if (!current) return;
      const { run: call, layer: target } = context.current;
      try {
        if (current.op.kind === "add") {
          await call(api.slopfight.play.addStrokes, {
            layer: target,
            seq: current.seq!,
            strokes: current.op.strokes,
          });
        } else if (current.op.kind === "undo") {
          await call(api.slopfight.play.undoStroke, { layer: target });
        } else {
          await call(api.slopfight.play.clearStrokes, { layer: target });
        }
        inflight.current = null;
        self.pump();
      } catch (cause) {
        if (!(cause instanceof ConvexError) && current.attempt + 1 < RETRY_LIMIT && alive.current) {
          current.attempt += 1;
          timer.current = window.setTimeout(
            () => void self.send(),
            RETRY_BASE_MS * 2 ** (current.attempt - 1),
          );
          return;
        }
        // The server said no (time is up, the canvas is full): stop sending and say so.
        failed.current = true;
        inflight.current = null;
        items.current = [];
        if (alive.current) setError(getConvexErrorMessage(cause, "Your drawing didn't save"));
        self.settle(false);
      }
    },
  };

  const push = useCallback((next: QueueItem[], item: QueueItem) => {
    if (failed.current || !alive.current) return;
    items.current = next;
    local.current = applyLocal(local.current, item);
    setStrokes(local.current);
    driver.current!.pump();
  }, []);

  const add = useCallback(
    (stroke: Stroke) => {
      if (!ready) return;
      const fitted = fitDoodleStroke(local.current, stroke);
      if (fitted) push(enqueueStroke(items.current, fitted), { kind: "stroke", stroke: fitted });
    },
    [push, ready],
  );
  const undo = useCallback(() => push(enqueueUndo(items.current), { kind: "undo" }), [push]);
  const clear = useCallback(() => push(enqueueClear(), { kind: "clear" }), [push]);

  const flush = useCallback(() => {
    if (failed.current || !alive.current || !ready) return Promise.resolve(false);
    if (!inflight.current && items.current.length === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      waiters.current.push(resolve);
      driver.current!.pump();
    });
  }, [ready]);

  const room = doodleRoom(strokes);
  return {
    strokes,
    below,
    ready,
    full: room.strokes === 0 || room.points === 0,
    error,
    add,
    undo,
    clear,
    flush,
  };
}
