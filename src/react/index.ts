"use client";

// TODO: I dont think this file is needed.

import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

/**
 * React hook for timeline status.
 *
 * Subscribes to timeline status for a given scope, providing reactive
 * updates for canUndo, canRedo, position, and length.
 *
 * @param statusQuery - Reference to the getStatus query from the timeline component
 * @param scope - Timeline scope identifier
 * @returns Timeline status object, or undefined while loading
 *
 * @example
 * ```tsx
 * import { useTimelineStatus } from "convex-timeline/react";
 * import { api } from "../convex/_generated/api";
 *
 * function UndoRedoButtons({ scope }: { scope: string }) {
 *   const status = useTimelineStatus(api.timeline.getStatus, scope);
 *
 *   if (!status) return <div>Loading...</div>;
 *
 *   return (
 *     <div>
 *       <button disabled={!status.canUndo}>Undo</button>
 *       <button disabled={!status.canRedo}>Redo</button>
 *       <span>Position: {status.position} / {status.length}</span>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTimelineStatus(
  statusQuery: FunctionReference<
    "query",
    "public",
    { scope: string },
    {
      canUndo: boolean;
      canRedo: boolean;
      position: number;
      length: number;
    }
  >,
  scope: string,
) {
  return useQuery(statusQuery, { scope });
}

/**
 * React hook for current timeline state.
 *
 * Subscribes to the current state at the timeline head for a given scope.
 *
 * @param currentQuery - Reference to the getCurrent query from the timeline component
 * @param scope - Timeline scope identifier
 * @returns Current state, null if at position 0, or undefined while loading
 *
 * @example
 * ```tsx
 * import { useTimelineCurrent } from "convex-timeline/react";
 * import { api } from "../convex/_generated/api";
 *
 * function DocumentViewer({ scope }: { scope: string }) {
 *   const current = useTimelineCurrent(api.timeline.getCurrent, scope);
 *
 *   if (current === undefined) return <div>Loading...</div>;
 *   if (current === null) return <div>No state yet</div>;
 *
 *   return <pre>{JSON.stringify(current, null, 2)}</pre>;
 * }
 * ```
 */
export function useTimelineCurrent<T>(
  currentQuery: FunctionReference<
    "query",
    "public",
    { scope: string },
    T | null
  >,
  scope: string,
): T | null | undefined {
  return useQuery(currentQuery, { scope });
}

/**
 * React hook for timeline checkpoints.
 *
 * Subscribes to the list of checkpoint names for a given scope.
 *
 * @param checkpointsQuery - Reference to the getCheckpoints query from the timeline component
 * @param scope - Timeline scope identifier
 * @returns Array of checkpoint names, or undefined while loading
 *
 * @example
 * ```tsx
 * import { useTimelineCheckpoints } from "convex-timeline/react";
 * import { api } from "../convex/_generated/api";
 *
 * function CheckpointList({ scope }: { scope: string }) {
 *   const checkpoints = useTimelineCheckpoints(api.timeline.getCheckpoints, scope);
 *
 *   if (!checkpoints) return <div>Loading...</div>;
 *
 *   return (
 *     <ul>
 *       {checkpoints.map(name => (
 *         <li key={name}>{name}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useTimelineCheckpoints(
  checkpointsQuery: FunctionReference<
    "query",
    "public",
    { scope: string },
    string[]
  >,
  scope: string,
): string[] | undefined {
  return useQuery(checkpointsQuery, { scope });
}
