"use client";

import React from "react";
import { motion } from "framer-motion";
import CommitCardSkeleton from "./CommitCardSkeleton";

interface CommitListSkeletonProps {
  count?: number;
  showProjectBadges?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

export default function CommitListSkeleton({
  count = 8,
  showProjectBadges = false,
}: CommitListSkeletonProps) {
  return (
    <motion.div
      className="p-2 space-y-2"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {Array.from({ length: count }).map((_, i) => (
        <CommitCardSkeleton
          key={i}
          showProjectBadge={showProjectBadges}
        />
      ))}
    </motion.div>
  );
}
