"use client";

import React from "react";
import { motion } from "framer-motion";
import { Shimmer } from "./Shimmer";

interface CommitCardSkeletonProps {
  showProjectBadge?: boolean;
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export default function CommitCardSkeleton({
  showProjectBadge = false,
}: CommitCardSkeletonProps) {
  return (
    <motion.div
      variants={cardVariants}
      className="relative rounded-lg p-3 border-l-2 border-subtle bg-bg/50 overflow-hidden"
    >
      {/* Shimmer overlay */}
      <Shimmer className="absolute inset-0 z-10" />

      <div className="flex-1 min-w-0">
        {/* Project badge placeholder */}
        {showProjectBadge && (
          <div className="mb-1">
            <div className="h-5 w-20 bg-subtle/30 rounded" />
          </div>
        )}

        {/* Git hash placeholder */}
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 bg-subtle/30 rounded" />
        </div>

        {/* Title placeholder */}
        <div className="mt-1">
          <div className="h-5 w-3/4 bg-subtle/30 rounded" />
        </div>

        {/* Stats placeholder */}
        <div className="flex items-center gap-3 mt-1">
          <div className="h-4 w-16 bg-subtle/30 rounded" />
          <div className="h-4 w-20 bg-subtle/30 rounded" />
        </div>

        {/* Time placeholder */}
        <div className="mt-1">
          <div className="h-4 w-28 bg-subtle/30 rounded" />
        </div>
      </div>
    </motion.div>
  );
}
