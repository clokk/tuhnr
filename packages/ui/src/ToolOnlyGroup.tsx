"use client";

import React, { useState, forwardRef } from "react";
import type { Turn, ToolCall } from "@cogcommit/types";
import { formatToolInput } from "./utils/formatters";

interface ToolOnlyGroupProps {
  turns: Turn[];
  searchTerm?: string;
}

/**
 * Get tool summary for hover tooltip
 */
function getToolSummary(tc: ToolCall): string {
  const input = tc.input;
  if ("file_path" in input) return String(input.file_path);
  if ("command" in input) {
    const cmd = String(input.command);
    return cmd.length > 60 ? cmd.substring(0, 60) + "..." : cmd;
  }
  if ("pattern" in input) return `pattern: ${input.pattern}`;
  if ("query" in input) return `query: ${input.query}`;
  if ("url" in input) return String(input.url);
  if (tc.isError) return "Error";
  return tc.name;
}

interface ExtendedToolCall extends ToolCall {
  turnId: string;
}

/**
 * Displays a group of consecutive tool-only assistant turns in a compact row
 */
const ToolOnlyGroup = forwardRef<HTMLDivElement, ToolOnlyGroupProps>(
  function ToolOnlyGroup({ turns }, ref) {
    const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

    // Flatten all tool calls from all turns
    const allToolCalls: ExtendedToolCall[] = turns.flatMap((turn) =>
      (turn.toolCalls || []).map((tc) => ({
        ...tc,
        turnId: turn.id,
      }))
    );

    if (allToolCalls.length === 0) return null;

    return (
      <div ref={ref} className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-panel/50 border border-border/50 rounded-bl-md shadow-[0_1px_3px_rgba(0,0,0,0.15)]">
          {/* Compact header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-subtle font-mono">
              {allToolCalls.length} tool call
              {allToolCalls.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Tool pills in a wrapping row */}
          <div className="flex flex-wrap gap-1">
            {allToolCalls.map((tc) => (
              <button
                key={tc.id}
                title={getToolSummary(tc)}
                onClick={() =>
                  setExpandedToolId(expandedToolId === tc.id ? null : tc.id)
                }
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded cursor-pointer transition-colors
                  ${
                    tc.isError
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "bg-panel text-muted hover:bg-panel-alt"
                  }
                  ${expandedToolId === tc.id ? "ring-1 ring-chronicle-blue" : ""}`}
              >
                {tc.name}
              </button>
            ))}
          </div>

          {/* Expanded tool detail */}
          {expandedToolId && (
            <div className="mt-2 animate-expand">
              {allToolCalls
                .filter((tc) => tc.id === expandedToolId)
                .map((tc) => (
                  <div
                    key={tc.id}
                    className="bg-panel/50 rounded p-3 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`font-medium ${
                          tc.isError ? "text-red-400" : "text-chronicle-green"
                        }`}
                      >
                        {tc.name}
                      </span>
                      {tc.isError && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-red-400/20 text-red-400">
                          error
                        </span>
                      )}
                    </div>

                    {/* Input */}
                    {tc.input && Object.keys(tc.input).length > 0 && (
                      <details className="mt-1" open>
                        <summary className="text-muted cursor-pointer hover:text-muted">
                          Input
                        </summary>
                        <pre className="mt-1 p-2 bg-bg rounded text-muted overflow-x-auto">
                          {formatToolInput(tc.input)}
                        </pre>
                      </details>
                    )}

                    {/* Result */}
                    {tc.result && (
                      <details className="mt-1">
                        <summary className="text-muted cursor-pointer hover:text-muted">
                          Result
                        </summary>
                        <pre className="mt-1 p-2 bg-bg rounded text-muted overflow-x-auto max-h-40">
                          {tc.result.length > 500
                            ? tc.result.substring(0, 500) + "..."
                            : tc.result}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default ToolOnlyGroup;
