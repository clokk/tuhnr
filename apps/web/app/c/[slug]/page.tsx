import { createClient } from "@/lib/supabase/server";
import { getPublicCommit } from "@cogcommit/supabase/queries";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ConversationViewer } from "@cogcommit/ui";
import type { Metadata } from "next";
import PublicCommitHeader from "./PublicCommitHeader";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  try {
    const result = await getPublicCommit(supabase, slug);
    if (!result) {
      return {
        title: "Commit Not Found | CogCommit",
      };
    }

    const { commit, author } = result;
    const title = commit.title || "Untitled Conversation";
    const description = `AI-assisted development conversation by ${author.username}`;

    return {
      title: `${title} | CogCommit`,
      description,
      openGraph: {
        title: `${title} | CogCommit`,
        description,
        type: "article",
        siteName: "CogCommit",
        url: `/c/${slug}`,
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} | CogCommit`,
        description,
      },
    };
  } catch {
    return {
      title: "Commit Not Found | CogCommit",
    };
  }
}

export default async function PublicCommitPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const result = await getPublicCommit(supabase, slug);

  if (!result) {
    notFound();
  }

  const { commit, author } = result;

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
      <PublicCommitHeader author={author} user={currentUser} />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 max-w-6xl w-full mx-auto overflow-hidden">
          <ConversationViewer commit={commit} readOnly />
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
