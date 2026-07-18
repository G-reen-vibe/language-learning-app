"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * TanStack Query provider.
 *
 * Config mirrors the Flashcards app:
 *   - staleTime: 30s — short enough to pick up changes from other tabs /
 *     devices, long enough to avoid refetching mid-session.
 *   - refetchOnWindowFocus: false — critical for a practice app; a refetch
 *     would interrupt a study session if the user switches tabs.
 *   - retry: 1 — single retry on query errors (mutations handle their own
 *     retry logic where needed, e.g. /api/review).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
