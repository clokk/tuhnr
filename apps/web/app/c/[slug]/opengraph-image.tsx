import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getPublicCommit } from "@cogcommit/supabase/queries";

export const runtime = "nodejs";
export const alt = "CogCommit - AI-assisted development conversation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Design system colors
const colors = {
  bg: "#0d0b0a",
  panel: "#181614",
  primary: "#e8e4df",
  muted: "#a39e97",
  subtle: "#6b6660",
  border: "#2a2725",
  chronicleGreen: "#5fb88e",
  chronicleAmber: "#d4a030",
  chroniclePurple: "#9d7cd8",
  chronicleBlue: "#7aa2f7",
};

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function OgImage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const result = await getPublicCommit(supabase, slug);

  if (!result) {
    // Return a generic fallback image
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.bg,
          }}
        >
          <div style={{ color: colors.muted, fontSize: 32 }}>
            Commit not found
          </div>
        </div>
      ),
      { ...size }
    );
  }

  const { commit, author } = result;

  // Calculate stats
  const turnCount =
    commit.sessions?.reduce((sum, s) => sum + (s.turns?.length || 0), 0) || 0;
  const sessionCount = commit.sessions?.length || 0;
  const hasGitHash = !!commit.gitHash;

  // Format title
  const title = commit.title || getFirstUserMessage(commit) || "Conversation";
  const displayTitle = title.length > 80 ? title.slice(0, 77) + "..." : title;

  // Format date
  const closedAt = new Date(commit.closedAt);
  const formattedDate = closedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = closedAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: colors.bg,
          padding: 48,
        }}
      >
        {/* Main card */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            backgroundColor: colors.panel,
            borderRadius: 16,
            border: `1px solid ${colors.border}`,
            overflow: "hidden",
          }}
        >
          {/* Left accent bar + content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "row",
            }}
          >
            {/* Accent bar */}
            <div
              style={{
                width: 6,
                backgroundColor: hasGitHash
                  ? colors.chronicleGreen
                  : colors.chronicleAmber,
              }}
            />

            {/* Card content */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: 40,
                gap: 20,
              }}
            >
              {/* Top row: Hash + badges */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                {/* Git hash badge */}
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 24,
                    color: hasGitHash
                      ? colors.chronicleGreen
                      : colors.chronicleAmber,
                  }}
                >
                  {hasGitHash
                    ? `[${commit.gitHash!.substring(0, 7)}]`
                    : "[uncommitted]"}
                </span>

                {/* Public badge */}
                <span
                  style={{
                    display: "flex",
                    padding: "6px 12px",
                    fontSize: 18,
                    fontWeight: 500,
                    borderRadius: 6,
                    backgroundColor: `${colors.chronicleGreen}33`,
                    color: colors.chronicleGreen,
                  }}
                >
                  Public
                </span>

                {/* Parallel indicator */}
                {commit.parallel && (
                  <span
                    style={{
                      fontSize: 20,
                      color: colors.chroniclePurple,
                    }}
                  >
                    ||
                  </span>
                )}
              </div>

              {/* Title */}
              <div
                style={{
                  fontSize: 42,
                  fontWeight: 600,
                  color: colors.primary,
                  lineHeight: 1.3,
                  marginTop: 12,
                }}
              >
                {displayTitle}
              </div>

              {/* Stats */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: 24,
                  fontSize: 24,
                  color: colors.muted,
                  marginTop: 8,
                }}
              >
                <span>{`${turnCount} prompts`}</span>
                <span style={{ color: colors.subtle }}>·</span>
                <span>{`${sessionCount} session${sessionCount !== 1 ? "s" : ""}`}</span>
              </div>

              {/* Timestamp */}
              <div
                style={{
                  fontSize: 22,
                  color: colors.subtle,
                  marginTop: 4,
                }}
              >
                {`${formattedDate} at ${formattedTime}`}
              </div>
            </div>
          </div>
        </div>

        {/* Footer row */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          {/* Author info */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            {author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={author.avatarUrl}
                alt=""
                width={40}
                height={40}
                style={{ borderRadius: 20 }}
              />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.panel,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: colors.primary,
                  fontSize: 18,
                  fontWeight: 500,
                }}
              >
                {author.username[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                fontSize: 22,
                color: colors.muted,
              }}
            >
              <span>Shared by </span>
              <span style={{ color: colors.primary, fontWeight: 500 }}>
                {`@${author.username}`}
              </span>
            </div>
          </div>

          {/* CogCommit branding */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: colors.primary,
              }}
            >
              CogCommit
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

/**
 * Extract first user message from commit for preview
 */
function getFirstUserMessage(commit: {
  sessions?: Array<{
    turns?: Array<{ role?: string; content?: string | null }>;
  }>;
}): string | null {
  if (!commit.sessions) return null;
  for (const session of commit.sessions) {
    if (!session.turns) continue;
    for (const turn of session.turns) {
      if (turn.role === "user" && turn.content) {
        const content = turn.content.trim();
        return content.length > 100 ? content.substring(0, 100) + "..." : content;
      }
    }
  }
  return null;
}
