"use client";

import { CommitListSkeleton, Shimmer } from "@cogcommit/ui";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export default function DashboardLoading() {
  return (
    <motion.div
      className="h-screen flex flex-col overflow-hidden bg-bg"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      {/* Header skeleton */}
      <div className="h-14 border-b border-border bg-panel flex items-center justify-between px-4 relative overflow-hidden">
        <Shimmer className="absolute inset-0" />
        <div className="flex items-center gap-4">
          <div className="h-6 w-6 bg-subtle/30 rounded" />
          <div className="h-5 w-32 bg-subtle/30 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-24 bg-subtle/30 rounded" />
          <div className="h-8 w-8 bg-subtle/30 rounded-full" />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left Panel - Commit List skeleton */}
        <div
          className="bg-panel border-r border-border flex flex-col"
          style={{ width: 384 }}
        >
          {/* Sidebar header skeleton */}
          <div className="h-10 border-b border-border flex items-center justify-between px-3 relative overflow-hidden">
            <Shimmer className="absolute inset-0" />
            <div className="flex items-center gap-2">
              <div className="h-4 w-16 bg-subtle/30 rounded" />
              <div className="h-5 w-8 bg-subtle/30 rounded-full" />
            </div>
            <div className="h-6 w-6 bg-subtle/30 rounded" />
          </div>

          {/* Commit list skeleton */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
            <CommitListSkeleton count={8} showProjectBadges={true} />
          </div>
        </div>

        {/* Resizer placeholder */}
        <div className="w-1 bg-panel flex-shrink-0" />

        {/* Right Panel - Detail skeleton */}
        <div className="flex-1 bg-panel-alt overflow-hidden flex flex-col">
          {/* Detail header skeleton */}
          <div className="h-16 border-b border-border flex items-center justify-between px-6 relative overflow-hidden">
            <Shimmer className="absolute inset-0" />
            <div className="flex-1">
              <div className="h-6 w-64 bg-subtle/30 rounded mb-2" />
              <div className="h-4 w-48 bg-subtle/30 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-subtle/30 rounded" />
              <div className="h-8 w-8 bg-subtle/30 rounded" />
            </div>
          </div>

          {/* Conversation skeleton */}
          <motion.div
            className="flex-1 p-6 space-y-4 overflow-auto"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.15 },
              },
            }}
            initial="hidden"
            animate="visible"
          >
            {/* User message skeleton */}
            <motion.div
              className="flex gap-3"
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <div className="h-8 w-8 bg-subtle/30 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-subtle/30 rounded" />
                <div className="h-20 w-full bg-subtle/30 rounded-lg relative overflow-hidden">
                  <Shimmer className="absolute inset-0" />
                </div>
              </div>
            </motion.div>

            {/* Assistant message skeleton */}
            <motion.div
              className="flex gap-3"
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <div className="h-8 w-8 bg-chronicle-blue/30 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-20 bg-subtle/30 rounded" />
                <div className="h-32 w-full bg-subtle/30 rounded-lg relative overflow-hidden">
                  <Shimmer className="absolute inset-0" />
                </div>
              </div>
            </motion.div>

            {/* Another user message skeleton */}
            <motion.div
              className="flex gap-3"
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <div className="h-8 w-8 bg-subtle/30 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-subtle/30 rounded" />
                <div className="h-16 w-3/4 bg-subtle/30 rounded-lg relative overflow-hidden">
                  <Shimmer className="absolute inset-0" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
