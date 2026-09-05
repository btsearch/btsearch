import { startTransition, useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from "react";

import { advanceNsgReplay } from "@/lib/nsg/replay";
import { type NsgSnapshot, type NsgSnapshotCollection, findNearestNsgSnapshotIndex } from "@/lib/nsg/snapshots";
import type { NsgLog } from "@/lib/nsg/types";

import { type ReplayClock, createReplayClock } from "./replayClock";

type ReplayState = {
  sourceLog: NsgLog | null;
  selectedEventIndex: number | null;
  isPlaying: boolean;
  playheadMs: number | null;
};

type ReplayAction =
  | { type: "logChanged"; log: NsgLog | null }
  | { type: "select"; eventIndex: number }
  | { type: "stop" }
  | { type: "play"; eventIndex: number; playheadMs: number }
  | { type: "position"; eventIndex: number | null; playheadMs: number; finished: boolean };

function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case "logChanged":
      return { sourceLog: action.log, selectedEventIndex: null, isPlaying: false, playheadMs: null };
    case "select":
      return { ...state, selectedEventIndex: action.eventIndex, isPlaying: false, playheadMs: null };
    case "stop":
      return { ...state, isPlaying: false, playheadMs: null };
    case "play":
      return { ...state, selectedEventIndex: action.eventIndex, isPlaying: true, playheadMs: action.playheadMs };
    case "position":
      return {
        ...state,
        selectedEventIndex: action.eventIndex ?? state.selectedEventIndex,
        isPlaying: !action.finished,
        playheadMs: action.playheadMs,
      };
  }
}

export type ReplayController = Readonly<{
  clock: ReplayClock;
  selectedEventIndex: number | null;
  selectedIndex: number;
  snapshot: NsgSnapshot | null;
  selectedTimestamp: number | null;
  playheadMs: number | null;
  isPlaying: boolean;
  selectEvent: (eventIndex: number) => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
}>;

type ReplayOptions = {
  log: NsgLog | null;
  snapshotCollection: NsgSnapshotCollection;
  isParsing: boolean;
};

export function useReplay({ log, snapshotCollection, isParsing }: ReplayOptions): ReplayController {
  const [clock] = useState(createReplayClock);
  const runRef = useRef(0);
  const [state, dispatch] = useReducer(replayReducer, {
    sourceLog: log,
    selectedEventIndex: null,
    isPlaying: false,
    playheadMs: null,
  });
  if (state.sourceLog !== log) dispatch({ type: "logChanged", log });

  const { snapshots, indexByEvent } = snapshotCollection;
  const { selectedEventIndex, isPlaying, playheadMs } = state;
  const requestedTimestamp = selectedEventIndex === null ? null : (log?.events[selectedEventIndex]?.timestampMs ?? null);
  const exactIndex = selectedEventIndex === null ? undefined : indexByEvent.get(selectedEventIndex);
  const selectedIndex = exactIndex ?? findNearestNsgSnapshotIndex(snapshots, requestedTimestamp);
  const snapshot = snapshots[selectedIndex] ?? null;
  const selectedTimestamp = playheadMs ?? requestedTimestamp ?? snapshot?.timestampMs ?? null;

  const resetClock = useCallback(() => {
    runRef.current++;
    clock.set(null);
  }, [clock]);

  const stop = useCallback(() => {
    resetClock();
    dispatch({ type: "stop" });
  }, [resetClock]);

  const selectEvent = useCallback(
    (eventIndex: number) => {
      resetClock();
      dispatch({ type: "select", eventIndex });
    },
    [resetClock],
  );

  const handleReplayFrame = useEffectEvent((elapsedWallMs: number, publish: boolean) => {
    const currentPlayhead = clock.get() ?? playheadMs ?? snapshot?.timestampMs;
    if (currentPlayhead === undefined) {
      dispatch({ type: "stop" });
      return false;
    }
    const next = advanceNsgReplay(snapshots, currentPlayhead, elapsedWallMs);
    clock.set(next.playheadMs);
    const nextSnapshot = snapshots[next.index];
    if (publish || next.finished)
      startTransition(() =>
        dispatch({ type: "position", eventIndex: nextSnapshot?.eventIndex ?? null, playheadMs: next.playheadMs, finished: next.finished }),
      );
    return !next.finished;
  });

  useEffect(() => {
    runRef.current++;
    clock.set(null);
  }, [log, clock]);

  useEffect(() => {
    if (!isPlaying || isParsing) return;
    const run = ++runRef.current;
    let frame = 0;
    let previousFrame = performance.now();
    let previousPublish = previousFrame;
    const animate = (now: number) => {
      if (run !== runRef.current) return;
      const publish = now - previousPublish >= 100;
      const keepPlaying = handleReplayFrame(now - previousFrame, publish);
      previousFrame = now;
      if (publish) previousPublish = now;
      if (keepPlaying) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, isParsing]);

  const pause = useCallback(() => {
    runRef.current++;
    const current = clock.get();
    if (current === null) {
      dispatch({ type: "stop" });
      return;
    }
    const paused = advanceNsgReplay(snapshots, current, 0);
    dispatch({
      type: "position",
      eventIndex: snapshots[paused.index]?.eventIndex ?? null,
      playheadMs: paused.playheadMs,
      finished: true,
    });
  }, [clock, snapshots]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
      return;
    }
    if (!snapshot || snapshots.length < 2) return;
    const restart = selectedIndex === snapshots.length - 1;
    const firstSnapshot = snapshots[0];
    const start = restart ? firstSnapshot.timestampMs : (playheadMs ?? snapshot.timestampMs);
    clock.set(start);
    dispatch({ type: "play", eventIndex: restart ? firstSnapshot.eventIndex : snapshot.eventIndex, playheadMs: start });
  }, [clock, isPlaying, pause, playheadMs, selectedIndex, snapshot, snapshots]);

  return {
    clock,
    selectedEventIndex,
    selectedIndex,
    snapshot,
    selectedTimestamp,
    playheadMs,
    isPlaying,
    selectEvent,
    pause,
    toggle,
    stop,
  };
}
