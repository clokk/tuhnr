"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 5 minutes stale time - data is considered fresh for this duration
            staleTime: 5 * 60 * 1000,
            // 30 minutes garbage collection time
            gcTime: 30 * 60 * 1000,
            // Disabled to reduce unnecessary refetches
            // Data will still refetch when stale and user interacts
            refetchOnWindowFocus: false,
            // Don't retry failed requests immediately
            retry: 1,
            retryDelay: 1000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
