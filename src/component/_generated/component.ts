/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      checkpoint: FunctionReference<
        "mutation",
        "internal",
        { name: string; scope: string },
        null,
        Name
      >;
      clear: FunctionReference<
        "mutation",
        "internal",
        { scope: string },
        null,
        Name
      >;
      deleteCheckpoint: FunctionReference<
        "mutation",
        "internal",
        { name: string; scope: string },
        null,
        Name
      >;
      deleteScope: FunctionReference<
        "mutation",
        "internal",
        { scope: string },
        null,
        Name
      >;
      getAtPosition: FunctionReference<
        "query",
        "internal",
        { position: number; scope: string },
        any | null,
        Name
      >;
      getCheckpoint: FunctionReference<
        "query",
        "internal",
        { name: string; scope: string },
        any | null,
        Name
      >;
      getCheckpoints: FunctionReference<
        "query",
        "internal",
        { scope: string },
        Array<string>,
        Name
      >;
      getCurrent: FunctionReference<
        "query",
        "internal",
        { scope: string },
        any | null,
        Name
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { scope: string },
        {
          canRedo: boolean;
          canUndo: boolean;
          length: number;
          position: number;
        },
        Name
      >;
      push: FunctionReference<
        "mutation",
        "internal",
        { document: any; maxNodes?: number; scope: string },
        null,
        Name
      >;
      redo: FunctionReference<
        "mutation",
        "internal",
        { count?: number; scope: string },
        any | null,
        Name
      >;
      restoreCheckpoint: FunctionReference<
        "mutation",
        "internal",
        { maxNodes?: number; name: string; scope: string },
        any,
        Name
      >;
      undo: FunctionReference<
        "mutation",
        "internal",
        { count?: number; scope: string },
        any | null,
        Name
      >;
    };
  };
