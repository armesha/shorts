import { useCallback, useEffect, useRef, useState } from "react";
import type { CreatorDesignState } from "./types";

const MAX_DESIGN_HISTORY = 60;

export function useDesignHistory({
  designState,
  applyDesignState,
}: {
  designState: CreatorDesignState;
  applyDesignState: (state: CreatorDesignState) => void;
}) {
  const [designHistory, setDesignHistory] = useState<CreatorDesignState[]>([]);
  const [designHistoryIndex, setDesignHistoryIndex] = useState(-1);
  const designHistoryIndexRef = useRef(-1);
  const lastHistorySnapshotRef = useRef("");
  const restoringHistoryRef = useRef(false);

  useEffect(() => {
    designHistoryIndexRef.current = designHistoryIndex;
  }, [designHistoryIndex]);

  const pushDesignHistory = useCallback((state: CreatorDesignState) => {
    const serialized = JSON.stringify(state);
    if (serialized === lastHistorySnapshotRef.current) return;
    setDesignHistory((current) => {
      const baseIndex = designHistoryIndexRef.current;
      const base = baseIndex >= 0 ? current.slice(0, baseIndex + 1) : current;
      const next = [...base, state].slice(-MAX_DESIGN_HISTORY);
      const nextIndex = next.length - 1;
      designHistoryIndexRef.current = nextIndex;
      lastHistorySnapshotRef.current = serialized;
      setDesignHistoryIndex(nextIndex);
      return next;
    });
  }, []);

  const restoreDesignHistory = useCallback((nextIndex: number) => {
    const snapshot = designHistory[nextIndex];
    if (!snapshot) return;
    restoringHistoryRef.current = true;
    designHistoryIndexRef.current = nextIndex;
    lastHistorySnapshotRef.current = JSON.stringify(snapshot);
    setDesignHistoryIndex(nextIndex);
    applyDesignState(snapshot);
  }, [applyDesignState, designHistory]);

  const undoDesign = useCallback(() => {
    restoreDesignHistory(designHistoryIndexRef.current - 1);
  }, [restoreDesignHistory]);

  const redoDesign = useCallback(() => {
    restoreDesignHistory(designHistoryIndexRef.current + 1);
  }, [restoreDesignHistory]);

  const resetDesignHistory = useCallback((state?: CreatorDesignState) => {
    if (!state) {
      lastHistorySnapshotRef.current = "";
      designHistoryIndexRef.current = -1;
      setDesignHistory([]);
      setDesignHistoryIndex(-1);
      return;
    }
    lastHistorySnapshotRef.current = JSON.stringify(state);
    designHistoryIndexRef.current = 0;
    restoringHistoryRef.current = true;
    setDesignHistory([state]);
    setDesignHistoryIndex(0);
  }, []);

  useEffect(() => {
    if (restoringHistoryRef.current) {
      restoringHistoryRef.current = false;
      return;
    }
    const handle = window.setTimeout(() => pushDesignHistory(designState), 420);
    return () => window.clearTimeout(handle);
  }, [designState, pushDesignHistory]);

  return {
    canUndoDesign: designHistoryIndex > 0,
    canRedoDesign: designHistoryIndex >= 0 && designHistoryIndex < designHistory.length - 1,
    undoDesign,
    redoDesign,
    resetDesignHistory,
  };
}
