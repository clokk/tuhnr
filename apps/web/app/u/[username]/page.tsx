import { createClient } from "@/lib/supabase/server";
import { getPublicProfile } from "@cogcommit/supabase/queries";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import ProfileCommitCard from "./ProfileCommitCard";
import PublicPageHeader from "@/components/PublicPageHeader";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();

  try {
    const result = await getPublicProfile(supabase, username);
    if (!result) {
      return {
        title: "User Not Found | CogCommit",
      };
    }

    const { profile, stats } = result;
    const description = `${stats.publicCommitCount} public cognitive commit${stats.publicCommitCount !== 1 ? "s" : ""} by @${profile.username}`;

    return {
      title: `@${profile.username} | CogCommit`,
      description,
      openGraph: {
        title: `@${profile.username} | CogCommit`,
        description,
        type: "profile",
        siteName: "CogCommit",
        url: `/u/${username}`,
      },
      twitter: {
        card: "summary_large_image",
        title: `@${profile.username} | CogCommit`,
        description,
      },
    };
  } catch {
    return {
      title: "User Not Found | CogCommit",
    };
  }
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  const result = await getPublicProfile(supabase, username);

  if (!result) {
    notFound();
  }

  const { profile, commits, stats } = result;

  // Get current user for header
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const currentUser = authUser ? {
    userName: authUser.user_metadata?.user_name ||
              authUser.user_metadata?.preferred_username ||
              authUser.email?.split("@")[0] || "User",
    avatarUrl: `https://github.com/${authUser.user_metadata?.user_name || authUser.user_metadata?.preferred_username}.png`,
  } : null;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Navigation */}
      <PublicPageHeader user={currentUser} />

      {/* Profile header */}
      <div className="border-b border-border bg-panel">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.username}
                className="w-16 h-16 rounded-full"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-panel-alt flex items-center justify-center text-2xl font-medium text-primary">
                {profile.username[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-primary">
                @{profile.username}
              </h1>
              <p className="text-muted mt-1">
                {stats.publicCommitCount} public commit{stats.publicCommitCount !== 1 ? "s" : ""}
                {stats.totalPrompts > 0 && (
                  <span className="text-subtle"> · {stats.totalPrompts} prompts</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Commits grid */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h2 className="text-lg font-medium text-primary mb-6">
            Public Commits
          </h2>

          {commits.length === 0 ? (
            <div className="text-center py-12 text-muted">
              No public commits yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {commits.map((commit) => (
                <ProfileCommitCard key={commit.id} commit={commit} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <p className="text-muted text-sm">
              Document your AI-assisted development with{" "}
              <Link href="/" className="text-chronicle-blue hover:underline">
                CogCommit
              </Link>
            </p>
            <div className="flex items-center gap-4 text-muted text-sm">
              <a
                href="https://github.com/clokk/cogcommit"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
