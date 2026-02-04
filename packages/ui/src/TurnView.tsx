"use client";

import React, { useState, forwardRef } from "react";
import { motion } from "framer-motion";
import type { Turn, ToolCall } from "@cogcommit/types";
import {
  formatModelName,
  formatRelativeTime,
  formatAbsoluteTime,
  escapeRegex,
  formatToolInput,
} from "./utils/formatters";
import { formatTurnAsPlainText, copyToClipboard } from "./utils/export";

interface TurnViewProps {
  turn: Turn;
  searchTerm?: string;
  isMatch?: boolean;
  fontSize?: number;
  isHighlighted?: boolean;
  username?: string;
}

const COLLAPSE_THRESHOLD = 500;
const PREVIEW_LENGTH = 300;

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

/**
 * Highlight search matches in text
 */
function highlightMatches(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const regex = new RegExp(`(${escapeRegex(term)})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-chronicle-blue/30 text-primary rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

const TurnView = forwardRef<HTMLDivElement, TurnViewProps>(
  function TurnView({ turn, searchTerm, isMatch, fontSize = 16, isHighlighted, username }, ref) {
    const [expanded, setExpanded] = useState(false);
    const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isUser = turn.role === "user";
    const hasToolCalls = turn.toolCalls && turn.toolCalls.length > 0;
    const shouldCollapse = turn.content.length > COLLAPSE_THRESHOLD;

    const displayContent =
      shouldCollapse && !expanded
        ? turn.content.slice(0, PREVIEW_LENGTH)
        : turn.content;

    const handleCopy = async () => {
      const text = formatTurnAsPlainText(turn);
      const success = await copyToClipboard(text);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    };

    // Flash highlight: appears instantly, fades out over 0.5s
    const highlightShadow = isUser
      ? "0 0 20px 4px rgba(61, 132, 168, 0.5)"
      : "0 0 20px 4px rgba(61, 132, 168, 0.3)";
    const noShadow = "0 0 20px 4px rgba(61, 132, 168, 0)";

    return (
      <motion.div
        ref={ref}
        className={`flex ${isUser ? "justify-end" : "justify-start"} ${searchTerm && !isMatch ? "opacity-40" : ""}`}
      >
        <motion.div
          className={`group max-w-[80%] rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-chronicle-blue text-black rounded-br-md shadow-[0_2px_8px_rgba(61,132,168,0.15)]"
              : "bg-panel border border-border rounded-bl-md shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
          }`}
          animate={{ boxShadow: isHighlighted ? highlightShadow : noShadow }}
          transition={{
            duration: isHighlighted ? 0.1 : 0.5,
            ease: isHighlighted ? "easeOut" : "easeIn",
          }}
        >
          {/* Role indicator with model name */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-medium ${
                isUser ? "text-black/70" : "text-muted"
              }`}
            >
              {isUser ? (username || "You") : formatModelName(turn.model)}
            </span>
            <span
              className={`text-xs cursor-help ${isUser ? "text-black/50" : "text-subtle"}`}
              title={formatAbsoluteTime(turn.timestamp)}
            >
              {formatRelativeTime(turn.timestamp)}
            </span>
            {/* Sentiment indicators */}
            {turn.hasRejection && (
              <span
                className="w-2 h-2 rounded-full bg-red-500"
                title="Contains rejection"
              />
            )}
            {turn.hasApproval && (
              <span
                className={`w-2 h-2 rounded-full ${isUser ? "bg-green-600" : "bg-chronicle-green"}`}
                title="Contains approval"
              />
            )}
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className={`ml-auto p-1 transition-colors opacity-0 group-hover:opacity-100 ${
                isUser ? "text-black/50 hover:text-black" : "text-muted hover:text-primary"
              }`}
              title="Copy prompt"
            >
              {copied ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={isUser ? "text-green-700" : "text-chronicle-green"}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>

          {/* Content */}
          {turn.content && (
            <div className="relative">
              <div
                className={`whitespace-pre-wrap leading-relaxed ${isUser ? "text-black" : "text-primary"}`}
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
              >
                {searchTerm
                  ? highlightMatches(displayContent, searchTerm)
                  : displayContent}
                {shouldCollapse && !expanded && "..."}
              </div>
              {shouldCollapse && !expanded && (
                <div className={`absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t pointer-events-none ${
                  isUser ? "from-chronicle-blue/80" : "from-panel/80"
                } to-transparent`} />
              )}
            </div>
          )}

          {/* Show more button */}
          {shouldCollapse && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={`mt-2 text-sm transition-colors ${
                isUser
                  ? "text-black/70 hover:text-black"
                  : "text-chronicle-blue hover:text-chronicle-blue/80"
              }`}
            >
              {expanded
                ? "Show less"
                : `Show more (${turn.content.length.toLocaleString()} chars)`}
            </button>
          )}

          {/* Compact tool call pills */}
          {hasToolCalls && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-1">
                {turn.toolCalls!.map((tc) => (
                  <button
                    key={tc.id}
                    title={getToolSummary(tc)}
                    onClick={() =>
                      setExpandedToolId(expandedToolId === tc.id ? null : tc.id)
                    }
                    className={`px-2 py-0.5 text-xs font-mono rounded cursor-pointer transition-colors
                      ${
                        tc.isError
                          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          : isUser
                            ? "bg-black/10 text-black/70 hover:bg-black/20"
                            : "bg-panel-alt text-muted hover:bg-bg"
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
                  {turn.toolCalls!
                    .filter((tc) => tc.id === expandedToolId)
                    .map((tc) => (
                      <div
                        key={tc.id}
                        className={`rounded p-3 text-xs font-mono ${
                          isUser ? "bg-black/10" : "bg-panel-alt/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`font-medium ${
                              tc.isError
                                ? "text-red-400"
                                : isUser
                                  ? "text-green-700"
                                  : "text-chronicle-green"
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
                            <summary className={`cursor-pointer ${isUser ? "text-black/60 hover:text-black/80" : "text-muted hover:text-muted"}`}>
                              Input
                            </summary>
                            <pre className={`mt-1 p-2 rounded overflow-x-auto ${
                              isUser ? "bg-black/10 text-black/70" : "bg-bg text-muted"
                            }`}>
                              {formatToolInput(tc.input)}
                            </pre>
                          </details>
                        )}

                        {/* Result */}
                        {tc.result && (
                          <details className="mt-1">
                            <summary className={`cursor-pointer ${isUser ? "text-black/60 hover:text-black/80" : "text-muted hover:text-muted"}`}>
                              Result
                            </summary>
                            <pre className={`mt-1 p-2 rounded overflow-x-auto max-h-40 ${
                              isUser ? "bg-black/10 text-black/70" : "bg-bg text-muted"
                            }`}>
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
          )}
        </motion.div>
      </motion.div>
    );
  }
);

export default TurnView;
