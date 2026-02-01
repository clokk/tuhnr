import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

// Force dynamic rendering
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null; // Layout will redirect to login
  }

  const userName =
    user.user_metadata?.user_name ||
    user.user_metadata?.preferred_username ||
    user.email?.split("@")[0] ||
    "User";

  const avatarUrl = user.user_metadata?.avatar_url;

  // Don't fetch commits server-side - let client handle it with loading state
  return (
    <DashboardClient
      userId={user.id}
      userName={userName}
      avatarUrl={avatarUrl}
    />
  );
}
