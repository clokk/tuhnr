import React, { useState } from "react";
import { type Turn } from "../api";

interface TurnViewProps {
  turn: Turn;
}

export default function TurnView({ turn }: TurnViewProps) {
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);

  const isUser = turn.role === "user";
  const hasToolCalls = turn.toolCalls && turn.toolCalls.length > 0;

  return (
    <div
      className={`rounded-lg p-4 border-l-2 ${
        isUser
          ? "bg-chronicle-blue/5 border-chronicle-blue"
          : "bg-zinc-900/50 border-zinc-700"
      }`}
    >
      {/* Role indicator */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-sm font-medium ${
            isUser ? "text-chronicle-blue" : "text-zinc-400"
          }`}
        >
          {isUser ? "User" : "Assistant"}
        </span>
        <span className="text-xs text-zinc-600">
          {formatTime(turn.timestamp)}
        </span>
        {turn.triggersVisualUpdate && (
          <span className="px-1.5 py-0.5 text-xs rounded bg-chronicle-amber/20 text-chronicle-amber">
            visual update
          </span>
        )}
      </div>

      {/* Content */}
      {turn.content && (
        <div className="text-zinc-300 whitespace-pre-wrap text-sm leading-relaxed">
          {turn.content}
        </div>
      )}

      {/* Tool calls */}
      {hasToolCalls && (
        <div className="mt-3">
          <button
            onClick={() => setToolCallsExpanded(!toolCallsExpanded)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            <span>{toolCallsExpanded ? "▼" : "▶"}</span>
            {turn.toolCalls!.length} tool call{turn.toolCalls!.length !== 1 ? "s" : ""}
          </button>

          {toolCallsExpanded && (
            <div className="mt-2 space-y-2">
              {turn.toolCalls!.map((tc) => (
                <div
                  key={tc.id}
                  className="bg-zinc-800/50 rounded p-3 text-xs font-mono"
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
                    <details className="mt-1">
                      <summary className="text-zinc-500 cursor-pointer hover:text-zinc-400">
                        Input
                      </summary>
                      <pre className="mt-1 p-2 bg-zinc-900 rounded text-zinc-400 overflow-x-auto">
                        {formatToolInput(tc.input)}
                      </pre>
                    </details>
                  )}

                  {/* Result */}
                  {tc.result && (
                    <details className="mt-1">
                      <summary className="text-zinc-500 cursor-pointer hover:text-zinc-400">
                        Result
                      </summary>
                      <pre className="mt-1 p-2 bg-zinc-900 rounded text-zinc-400 overflow-x-auto max-h-40">
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
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatToolInput(input: Record<string, unknown>): string {
  // For common tools, show a simplified view
  if ("command" in input) {
    return `command: ${input.command}`;
  }
  if ("file_path" in input) {
    return `file: ${input.file_path}`;
  }
  if ("pattern" in input) {
    return `pattern: ${input.pattern}`;
  }
  return JSON.stringify(input, null, 2);
}
