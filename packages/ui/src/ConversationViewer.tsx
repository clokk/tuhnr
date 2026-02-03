"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from "react";
import type { CognitiveCommit, Turn } from "@cogcommit/types";
import TurnView from "./TurnView";
import ToolOnlyGroup from "./ToolOnlyGroup";
import {
  formatCommitAsMarkdown,
  formatCommitAsPlainText,
  downloadFile,
  copyToClipboard,
} from "./utils/export";
import {
  getSourceStyle,
  getClosureStyle,
  getProjectColor,
  getGapMinutes,
  formatGap,
  escapeRegex,
  formatTimeRange,
  generateTitlePreview,
} from "./utils/formatters";

export interface ConversationViewerProps {
  /** The commit to display */
  commit: CognitiveCommit;
  /** Called when title is changed (if omitted, title is not editable) */
  onTitleChange?: (newTitle: string) => Promise<void>;
  /** Called when delete is requested (if omitted, delete button is hidden) */
  onDelete?: () => Promise<void>;
}

// Font size settings
const FONT_SIZE_KEY = "cogcommit-font-size";
const FONT_SIZES = [12, 14, 16, 18, 20] as const;
type FontSize = (typeof FONT_SIZES)[number];
const DEFAULT_FONT_SIZE: FontSize = 16;

/**
 * Check if a turn is tool-only (no text content, only tool calls)
 */
function isToolOnlyTurn(turn: Turn): boolean {
  return (
    turn.role === "assistant" &&
    (!turn.content || turn.content.trim() === "") &&
    !!turn.toolCalls &&
    turn.toolCalls.length > 0
  );
}

type RenderItem =
  | { type: "turn"; turn: Turn; gapMinutes: number | null; isMatch: boolean }
  | { type: "tool-group"; turns: Turn[]; gapMinutes: number | null };

/**
 * ConversationViewer - shared component for displaying commit conversations
 *
 * Features:
 * - Turn-by-turn conversation display with time gap dividers
 * - Tool call grouping
 * - Search with highlighting and navigation
 * - Keyboard navigation (j/k for prompts)
 * - Font size controls
 * - Export (markdown, plain text, clipboard)
 * - Optional: editable title, delete button
 */
export const ConversationViewer = forwardRef<HTMLDivElement, ConversationViewerProps>(
  function ConversationViewer({ commit, onTitleChange, onDelete }, ref) {
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState(commit.title || "");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showFilesModal, setShowFilesModal] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [exportCopied, setExportCopied] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    // Item navigation state
    const [currentItemIndex, setCurrentItemIndex] = useState(0);

    // Flash highlight state - set when j/k navigates, fades out automatically
    const [highlightedItemIndex, setHighlightedItemIndex] = useState<number | null>(null);

    // Search state
    const [searchTerm, setSearchTerm] = useState("");
    const [searchMatchIndices, setSearchMatchIndices] = useState<number[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

    // Font size state
    const [fontSize, setFontSize] = useState<FontSize>(() => {
      if (typeof window === "undefined") return DEFAULT_FONT_SIZE;
      const stored = localStorage.getItem(FONT_SIZE_KEY);
      if (stored && FONT_SIZES.includes(parseInt(stored, 10) as FontSize)) {
        return parseInt(stored, 10) as FontSize;
      }
      return DEFAULT_FONT_SIZE;
    });

    const conversationRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const isScrollingProgrammatically = useRef(false);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reset state when commit changes
    useEffect(() => {
      setTitleValue(commit.title || "");
      setSearchTerm("");
      setCurrentItemIndex(0);
      setHighlightedItemIndex(null);
      setEditingTitle(false);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      if (conversationRef.current) {
        conversationRef.current.scrollTop = 0;
      }
    }, [commit.id]);

    // Font size handlers
    const increaseFontSize = useCallback(() => {
      setFontSize((current) => {
        const idx = FONT_SIZES.indexOf(current);
        const next = FONT_SIZES[Math.min(idx + 1, FONT_SIZES.length - 1)];
        if (typeof window !== "undefined") {
          localStorage.setItem(FONT_SIZE_KEY, next.toString());
        }
        return next;
      });
    }, []);

    const decreaseFontSize = useCallback(() => {
      setFontSize((current) => {
        const idx = FONT_SIZES.indexOf(current);
        const next = FONT_SIZES[Math.max(idx - 1, 0)];
        if (typeof window !== "undefined") {
          localStorage.setItem(FONT_SIZE_KEY, next.toString());
        }
        return next;
      });
    }, []);

    // Export handlers
    const handleExportMarkdown = useCallback(() => {
      const content = formatCommitAsMarkdown(commit);
      const filename = `${commit.title || "conversation"}-${commit.id.slice(0, 8)}.md`;
      downloadFile(content, filename, "text/markdown");
      setShowExportMenu(false);
    }, [commit]);

    const handleExportPlainText = useCallback(() => {
      const content = formatCommitAsPlainText(commit);
      const filename = `${commit.title || "conversation"}-${commit.id.slice(0, 8)}.txt`;
      downloadFile(content, filename, "text/plain");
      setShowExportMenu(false);
    }, [commit]);

    const handleCopyConversation = useCallback(async () => {
      const content = formatCommitAsMarkdown(commit);
      const success = await copyToClipboard(content);
      if (success) {
        setExportCopied(true);
        setTimeout(() => setExportCopied(false), 1500);
      }
      setShowExportMenu(false);
    }, [commit]);

    // Close export menu when clicking outside
    useEffect(() => {
      if (!showExportMenu) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
          setShowExportMenu(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showExportMenu]);

    // Build render items (groups consecutive tool-only turns)
    const renderItems = useMemo((): RenderItem[] => {
      const items: RenderItem[] = [];
      let prevTimestamp: string | null = null;
      let currentToolGroup: Turn[] = [];
      let toolGroupGap: number | null = null;

      const flushToolGroup = () => {
        if (currentToolGroup.length > 0) {
          items.push({
            type: "tool-group",
            turns: currentToolGroup,
            gapMinutes: toolGroupGap,
          });
          currentToolGroup = [];
          toolGroupGap = null;
        }
      };

      for (const session of commit.sessions) {
        for (const turn of session.turns) {
          const gapMinutes = prevTimestamp ? getGapMinutes(prevTimestamp, turn.timestamp) : null;
          const isMatch = searchTerm
            ? new RegExp(escapeRegex(searchTerm), "i").test(turn.content)
            : false;

          if (isToolOnlyTurn(turn)) {
            if (currentToolGroup.length === 0) {
              toolGroupGap = gapMinutes;
            }
            currentToolGroup.push(turn);
          } else {
            flushToolGroup();
            items.push({ type: "turn", turn, gapMinutes, isMatch });
          }

          prevTimestamp = turn.timestamp;
        }
      }

      flushToolGroup();
      return items;
    }, [commit, searchTerm]);

    // Build array of indices pointing to user prompt items only
    const userPromptIndices = useMemo(() => {
      return renderItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.type === "turn" && item.turn.role === "user")
        .map(({ index }) => index);
    }, [renderItems]);

    // Track which prompt the user is currently on
    const currentPromptPosition = useMemo(() => {
      for (let i = userPromptIndices.length - 1; i >= 0; i--) {
        if (userPromptIndices[i] <= currentItemIndex) {
          return i;
        }
      }
      return 0;
    }, [userPromptIndices, currentItemIndex]);

    // Scroll to a specific item and flash highlight
    const scrollToItem = useCallback((index: number, flash: boolean = false) => {
      const ref = itemRefs.current.get(index);
      if (ref) {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        isScrollingProgrammatically.current = true;
        ref.scrollIntoView({ behavior: "smooth", block: "center" });
        scrollTimeoutRef.current = setTimeout(() => {
          isScrollingProgrammatically.current = false;
          scrollTimeoutRef.current = null;
        }, 500);
      }
      setCurrentItemIndex(index);
      if (flash) {
        // Clear any existing highlight timeout
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }
        // Flash the highlight
        setHighlightedItemIndex(index);
        // Clear after animation completes (0.5s fade + buffer)
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedItemIndex(null);
          highlightTimeoutRef.current = null;
        }, 800);
      }
    }, []);

    // Find search matches
    useEffect(() => {
      if (!searchTerm || !renderItems.length) {
        setSearchMatchIndices([]);
        setCurrentMatchIndex(0);
        return;
      }

      const matches: number[] = [];
      renderItems.forEach((item, idx) => {
        if (item.type === "turn" && item.isMatch) {
          matches.push(idx);
        }
      });
      setSearchMatchIndices(matches);
      setCurrentMatchIndex(0);

      if (matches.length > 0) {
        scrollToItem(matches[0]);
      }
    }, [searchTerm, renderItems, scrollToItem]);

    // Navigation handlers - navigate by user prompts
    const goToNextItem = useCallback(() => {
      const nextPromptPos = currentPromptPosition + 1;
      if (nextPromptPos < userPromptIndices.length) {
        scrollToItem(userPromptIndices[nextPromptPos], true);
      }
    }, [currentPromptPosition, userPromptIndices, scrollToItem]);

    const goToPrevItem = useCallback(() => {
      const prevPromptPos = currentPromptPosition - 1;
      if (prevPromptPos >= 0) {
        scrollToItem(userPromptIndices[prevPromptPos], true);
      }
    }, [currentPromptPosition, userPromptIndices, scrollToItem]);

    const goToNextMatch = useCallback(() => {
      if (searchMatchIndices.length === 0) return;
      const nextIdx = (currentMatchIndex + 1) % searchMatchIndices.length;
      setCurrentMatchIndex(nextIdx);
      scrollToItem(searchMatchIndices[nextIdx]);
    }, [currentMatchIndex, searchMatchIndices, scrollToItem]);

    const goToPrevMatch = useCallback(() => {
      if (searchMatchIndices.length === 0) return;
      const prevIdx = currentMatchIndex === 0
        ? searchMatchIndices.length - 1
        : currentMatchIndex - 1;
      setCurrentMatchIndex(prevIdx);
      scrollToItem(searchMatchIndices[prevIdx]);
    }, [currentMatchIndex, searchMatchIndices, scrollToItem]);

    // Update current item based on scroll position
    useEffect(() => {
      const container = conversationRef.current;
      if (!container || renderItems.length === 0) return;

      const handleScroll = () => {
        if (isScrollingProgrammatically.current) return;

        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top;

        let closestIdx = 0;
        let closestDistance = Infinity;

        itemRefs.current.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          const distance = rect.top - containerTop;

          if (distance >= -rect.height && distance < closestDistance) {
            closestDistance = distance;
            closestIdx = idx;
          }
        });

        setCurrentItemIndex(closestIdx);
      };

      let ticking = false;
      const scrollListener = () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            handleScroll();
            ticking = false;
          });
          ticking = true;
        }
      };

      container.addEventListener("scroll", scrollListener);
      return () => container.removeEventListener("scroll", scrollListener);
    }, [renderItems.length]);

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }

        if (e.key === "j") {
          e.preventDefault();
          goToNextItem();
        } else if (e.key === "k") {
          e.preventDefault();
          goToPrevItem();
        } else if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
          searchInput?.focus();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [goToNextItem, goToPrevItem]);

    // Title save handler
    const handleSaveTitle = async () => {
      if (!onTitleChange) return;
      try {
        await onTitleChange(titleValue);
        setEditingTitle(false);
      } catch (err) {
        console.error("Failed to update title:", err);
      }
    };

    // Delete handler
    const handleDelete = async () => {
      if (!onDelete) return;
      try {
        await onDelete();
      } catch (err) {
        console.error("Failed to delete commit:", err);
      }
    };

    const turnCount = commit.turnCount ?? 0;
    const projectColor = commit.projectName ? getProjectColor(commit.projectName) : null;
    const sourceStyle = getSourceStyle(commit.source);
    const closureStyle = getClosureStyle(commit.closedBy);

    return (
      <div ref={ref} className="h-full flex flex-col" style={{ minHeight: 0 }}>
        {/* Header Section */}
        <div className="flex-shrink-0 p-4 border-b border-border bg-panel-alt">
          {/* Row 1: Metadata + Stats + Search + Actions */}
          <div className="flex items-center gap-3 text-sm">
            {/* Source badge */}
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${sourceStyle.bg} ${sourceStyle.text}`}>
              {sourceStyle.label}
            </span>

            {/* Project badge */}
            {commit.projectName && projectColor && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${projectColor.bg} ${projectColor.text}`}>
                {commit.projectName}
              </span>
            )}

            {/* Git hash or closure badge */}
            {commit.gitHash ? (
              <span className="font-mono text-chronicle-green text-xs">
                [{commit.gitHash.substring(0, 7)}]
              </span>
            ) : (
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${closureStyle.bg} ${closureStyle.text}`}>
                {closureStyle.label}
              </span>
            )}

            {/* Stats */}
            <span className="text-subtle">·</span>
            <span className="text-muted">{turnCount} prompts</span>
            <span className="text-subtle">·</span>
            {commit.filesChanged.length > 0 ? (
              <button
                onClick={() => setShowFilesModal(true)}
                className="text-chronicle-amber hover:text-chronicle-amber/80 transition-colors"
              >
                {commit.filesChanged.length} files
              </button>
            ) : (
              <span className="text-muted">0 files</span>
            )}

            <div className="flex-1" />

            {/* Search input */}
            <div className="relative">
              <input
                type="text"
                data-search-input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="/ search"
                className="w-36 bg-panel border border-border rounded px-2 py-1 text-xs text-primary placeholder-muted focus:border-chronicle-blue focus:outline-none focus:w-48 transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (e.shiftKey) goToPrevMatch();
                    else goToNextMatch();
                  }
                  if (e.key === "Escape") {
                    setSearchTerm("");
                    e.currentTarget.blur();
                  }
                }}
              />
              {searchTerm && searchMatchIndices.length > 0 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <span className="text-xs text-muted">
                    {currentMatchIndex + 1}/{searchMatchIndices.length}
                  </span>
                  <button
                    onClick={goToPrevMatch}
                    className="text-muted hover:text-primary p-0.5"
                    title="Previous match (Shift+Enter)"
                  >
                    ▲
                  </button>
                  <button
                    onClick={goToNextMatch}
                    className="text-muted hover:text-primary p-0.5"
                    title="Next match (Enter)"
                  >
                    ▼
                  </button>
                </div>
              )}
              {searchTerm && searchMatchIndices.length === 0 && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">
                  0
                </span>
              )}
            </div>

            {/* Export dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-2 py-1 text-xs text-muted hover:text-primary hover:bg-panel rounded transition-colors flex items-center gap-1"
              >
                {exportCopied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-chronicle-green">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                Export
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 bg-panel border border-border rounded shadow-lg z-10 py-1 min-w-[160px]">
                  <button
                    onClick={handleExportMarkdown}
                    className="block w-full text-left px-3 py-2 text-xs text-primary hover:bg-panel-alt transition-colors"
                  >
                    Download as Markdown
                  </button>
                  <button
                    onClick={handleExportPlainText}
                    className="block w-full text-left px-3 py-2 text-xs text-primary hover:bg-panel-alt transition-colors"
                  >
                    Download as Plain Text
                  </button>
                  <button
                    onClick={handleCopyConversation}
                    className="block w-full text-left px-3 py-2 text-xs text-primary hover:bg-panel-alt transition-colors"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              )}
            </div>

            {/* Delete button - only show if onDelete is provided */}
            {onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
              >
                Delete
              </button>
            )}
          </div>

          {/* Row 2: Time range */}
          <div className="mt-2 text-xs text-muted">
            {formatTimeRange(commit.startedAt, commit.closedAt)}
          </div>

          {/* Row 3: Editable title */}
          <div className="mt-2">
            {editingTitle && onTitleChange ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  placeholder="Enter a title..."
                  className="flex-1 bg-panel border border-border rounded px-3 py-1.5 text-primary text-sm focus:border-chronicle-blue focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                />
                <button
                  onClick={handleSaveTitle}
                  className="px-2 py-1.5 bg-chronicle-blue text-black rounded font-medium text-xs hover:bg-chronicle-blue/90"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingTitle(false)}
                  className="px-2 py-1.5 bg-panel-alt text-primary rounded font-medium text-xs hover:bg-panel"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2
                onClick={() => onTitleChange && setEditingTitle(true)}
                className={`text-base font-medium ${onTitleChange ? "cursor-pointer hover:text-chronicle-blue" : ""} transition-colors ${commit.title ? "text-primary" : "text-muted italic"}`}
              >
                {commit.title || generateTitlePreview(commit.sessions[0]?.turns.find(t => t.role === "user")?.content)}
                {onTitleChange && !commit.title && (
                  <span className="ml-2 text-xs text-subtle not-italic">(click to edit)</span>
                )}
              </h2>
            )}
          </div>
        </div>

        {/* Conversation Section */}
        <div
          ref={conversationRef}
          className="p-6 pt-4"
          style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto' }}
        >
          <div className="space-y-4">
            {renderItems.map((item, idx) => {
              if (item.type === "tool-group") {
                const groupKey = item.turns.map((t) => t.id).join("-");
                return (
                  <React.Fragment key={groupKey}>
                    {item.gapMinutes !== null && item.gapMinutes > 60 && (
                      <div className="flex items-center gap-4 py-2 text-subtle text-xs">
                        <div className="flex-1 h-px bg-panel" />
                        <span>{formatGap(item.gapMinutes)} later</span>
                        <div className="flex-1 h-px bg-panel" />
                      </div>
                    )}
                    <ToolOnlyGroup
                      ref={(el: HTMLDivElement | null) => {
                        if (el) itemRefs.current.set(idx, el);
                      }}
                      turns={item.turns}
                      searchTerm={searchTerm}
                    />
                  </React.Fragment>
                );
              }

              const { turn, gapMinutes, isMatch } = item;
              return (
                <React.Fragment key={turn.id}>
                  {gapMinutes !== null && gapMinutes > 60 && (
                    <div className="flex items-center gap-4 py-2 text-subtle text-xs">
                      <div className="flex-1 h-px bg-panel" />
                      <span>{formatGap(gapMinutes)} later</span>
                      <div className="flex-1 h-px bg-panel" />
                    </div>
                  )}
                  <TurnView
                    ref={(el: HTMLDivElement | null) => {
                      if (el) itemRefs.current.set(idx, el);
                    }}
                    turn={turn}
                    searchTerm={searchTerm}
                    isMatch={isMatch}
                    fontSize={fontSize}
                    isHighlighted={idx === highlightedItemIndex}
                  />
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Navigation bar */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-border bg-panel-alt flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevItem}
              disabled={currentPromptPosition === 0}
              className="text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous prompt (k)"
            >
              ◀
            </button>
            <span className="text-sm text-muted font-mono w-32 text-center">
              {currentPromptPosition + 1} / {userPromptIndices.length}
            </span>
            <button
              onClick={goToNextItem}
              disabled={currentPromptPosition >= userPromptIndices.length - 1}
              className="text-muted hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next prompt (j)"
            >
              ▶
            </button>
          </div>

          <div className="flex-1" />

          {/* Font size controls */}
          <div className="flex items-center gap-1 border border-border rounded">
            <button
              onClick={decreaseFontSize}
              disabled={fontSize === FONT_SIZES[0]}
              className="px-2 py-1 text-muted hover:text-primary hover:bg-panel-alt disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-l"
              title="Decrease font size"
            >
              <span className="text-xs font-bold">A</span>
            </button>
            <span className="px-2 text-xs text-muted font-mono">{fontSize}</span>
            <button
              onClick={increaseFontSize}
              disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
              className="px-2 py-1 text-muted hover:text-primary hover:bg-panel-alt disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-r"
              title="Increase font size"
            >
              <span className="text-sm font-bold">A</span>
            </button>
          </div>

          <span className="text-xs text-subtle">
            j/k: prompts · /: search
          </span>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && onDelete && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-panel rounded-lg p-6 max-w-md">
              <h3 className="text-lg font-medium text-primary mb-2">Delete Commit?</h3>
              <p className="text-muted mb-4">
                This will permanently delete this cognitive commit and all associated
                data. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-panel-alt text-primary rounded font-medium hover:bg-panel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-primary rounded font-medium hover:bg-red-500"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Files changed modal */}
        {showFilesModal && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => setShowFilesModal(false)}
          >
            <div
              className="bg-panel rounded-lg p-6 w-full mx-8 max-w-[90vw] max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-primary">
                  Files Changed ({commit.filesChanged.length})
                </h3>
                <button
                  onClick={() => setShowFilesModal(false)}
                  className="text-muted hover:text-primary transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto flex-1 bg-bg rounded-lg p-4">
                <ul className="space-y-1">
                  {commit.filesChanged.map((file, i) => (
                    <li key={i} className="font-mono text-sm text-chronicle-amber">
                      {file}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default ConversationViewer;
