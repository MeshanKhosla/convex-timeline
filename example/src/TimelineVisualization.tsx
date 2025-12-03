import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useEffect, useRef, useState } from "react";

interface Node {
  position: number;
  document: unknown;
}

export function TimelineVisualization({
  listId,
  currentPosition,
  onNavigateToPosition,
}: {
  listId: Id<"todoLists">;
  currentPosition: number | null;
  onNavigateToPosition?: (position: number) => void;
}) {
  const nodes = useQuery(api.example.getAllTimelineNodes, {
    todoListId: listId,
  });
  const checkpointPositions = useQuery(api.example.getCheckpointPositions, {
    todoListId: listId,
  });
  const [pruningNodes, setPruningNodes] = useState<Set<number>>(new Set());
  const prevNodesRef = useRef<Node[]>([]);

  useEffect(() => {
    if (!nodes) return;

    const prevNodes = prevNodesRef.current;
    const currentPositions = new Set(nodes.map((n) => n.position));

    // Find nodes that were pruned (existed before but not now)
    const pruned = new Set<number>();
    for (const prevNode of prevNodes) {
      if (!currentPositions.has(prevNode.position)) {
        pruned.add(prevNode.position);
      }
    }

    prevNodesRef.current = nodes;

    if (pruned.size > 0) {
      // Use setTimeout to avoid calling setState synchronously in effect
      const timer = setTimeout(() => {
        setPruningNodes(pruned);
        // Clear pruning animation after it completes
        const clearTimer = setTimeout(() => {
          setPruningNodes(new Set());
        }, 600); // Match animation duration
        return () => clearTimeout(clearTimer);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [nodes]);

  if (nodes === undefined) {
    return (
      <div className="timeline-viz">
        <div className="timeline-loading">Loading timeline...</div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="timeline-viz">
        <div className="timeline-empty">No timeline nodes yet</div>
      </div>
    );
  }

  const maxPosition = Math.max(...nodes.map((n) => n.position));
  const minPosition = Math.min(...nodes.map((n) => n.position));

  return (
    <div className="timeline-viz">
      <div className="timeline-container">
        <div className="timeline-track">
          {/* Nodes */}
          {nodes.map((node) => {
            const isHead = node.position === currentPosition;
            const isPruning = pruningNodes.has(node.position);
            const isAhead =
              currentPosition !== null && node.position > currentPosition;
            const isBehind =
              currentPosition !== null && node.position < currentPosition;
            const hasCheckpoint =
              checkpointPositions?.includes(node.position) ?? false;

            // Calculate position percentage, leaving some padding
            const positionPercent =
              maxPosition > minPosition
                ? ((node.position - minPosition) /
                    (maxPosition - minPosition)) *
                    90 +
                  5 // 5% padding on each side
                : 50;

            return (
              <div
                key={node.position}
                className={`timeline-node ${isHead ? "head" : ""} ${
                  isAhead ? "ahead" : ""
                } ${isBehind ? "behind" : ""} ${isPruning ? "pruning" : ""} ${
                  hasCheckpoint ? "checkpoint" : ""
                }`}
                style={{
                  left: `${positionPercent}%`,
                }}
              >
                <div className="node-connector"></div>
                <div
                  className="node-circle"
                  onClick={() => {
                    if (onNavigateToPosition && !isHead) {
                      onNavigateToPosition(node.position);
                    }
                  }}
                  style={{
                    cursor: isHead ? "default" : "pointer",
                  }}
                >
                  {isHead && <div className="head-indicator"></div>}
                  {hasCheckpoint && (
                    <div className="checkpoint-indicator">●</div>
                  )}
                </div>
                {isPruning && (
                  <div className="pruning-overlay">
                    <div className="pruning-icon">✕</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
