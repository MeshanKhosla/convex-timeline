"use client";

import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

/**
 * React hook for timeline status.
 * Returns { canUndo, canRedo, position, length } or undefined while loading.
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
 * Returns current state, null if at position 0, or undefined while loading.
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
 * Returns array of checkpoint names, or undefined while loading.
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
