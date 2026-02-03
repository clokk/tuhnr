import { createClient } from "@/lib/supabase/server";
import { getPublicCommit } from "@cogcommit/supabase/queries";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ConversationViewer } from "@cogcommit/ui";
import type { Metadata } from "next";

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

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Navigation */}
      <header className="border-b border-border">
        <nav className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-primary">
            CogCommit
          </Link>

          <div className="flex items-center gap-4">
            {/* Author info */}
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>Shared by</span>
              {author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={author.avatarUrl}
                  alt={author.username}
                  className="w-6 h-6 rounded-full"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-panel flex items-center justify-center text-xs font-medium text-primary">
                  {author.username[0]?.toUpperCase() || "U"}
                </div>
              )}
              <span className="text-primary font-medium">{author.username}</span>
            </div>

            <Link
              href="/login"
              className="px-4 py-2 bg-chronicle-blue text-black rounded-lg font-medium hover:bg-chronicle-blue/90 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </nav>
      </header>

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
