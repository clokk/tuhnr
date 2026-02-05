/**
 * GitHub OAuth authentication for cloud sync
 * Uses PKCE flow with manual verifier handling for CLI
 */

import { createServer } from "http";
import { parse as parseUrl } from "url";
import * as crypto from "crypto";
import * as open from "open";
import {
  getSupabaseClient,
  getAuthenticatedClient,
  saveAuthTokens,
  clearAuthTokens,
  loadAuthTokens,
  getMachineId,
  resetClient,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "./client";
import type { AuthTokens, UserProfile } from "./types";
import { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_URL } from "../constants";

// PKCE helpers
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Start the OAuth login flow
 * Opens browser for GitHub OAuth, waits for callback
 */
export async function login(): Promise<UserProfile> {
  const supabase = getSupabaseClient();

  // Generate PKCE codes
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return new Promise((resolve, reject) => {
    // Create a temporary server to handle the OAuth callback
    const server = createServer(async (req, res) => {
      const url = parseUrl(req.url || "", true);

      if (url.pathname === "/auth/callback") {
        const code = url.query.code as string;
        const accessToken = url.query.access_token as string;
        const refreshToken = url.query.refresh_token as string;
        const error = url.query.error as string;
        const errorDescription = url.query.error_description as string;

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Authentication Failed</h1>
                <p>${error}: ${errorDescription || ""}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`OAuth error: ${error} - ${errorDescription || ""}`));
          return;
        }

        // If no code and no tokens in query, serve a page that extracts from hash
        if (!code && !accessToken) {
          // Supabase might return tokens in the URL hash (fragment)
          // Serve a page that extracts them and sends back to server
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Processing authentication...</h1>
                <p id="status">Extracting tokens...</p>
                <script>
                  // Check if tokens are in the hash
                  const hash = window.location.hash.substring(1);
                  if (hash) {
                    const params = new URLSearchParams(hash);
                    const accessToken = params.get('access_token');
                    const refreshToken = params.get('refresh_token');
                    if (accessToken) {
                      // Redirect with tokens as query params
                      window.location.href = '/auth/callback?access_token=' + encodeURIComponent(accessToken) +
                        '&refresh_token=' + encodeURIComponent(refreshToken || '');
                    } else {
                      document.getElementById('status').textContent = 'No tokens found in response';
                    }
                  } else {
                    document.getElementById('status').textContent = 'No authentication data received';
                  }
                </script>
              </body>
            </html>
          `);
          return;
        }

        try {
          let session;
          let user;

          if (accessToken) {
            // Tokens were passed directly (from hash extraction)
            const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
            if (userError || !userData.user) {
              throw new Error(userError?.message || "Failed to get user");
            }
            user = userData.user;
            session = {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour default
            };
          } else {
            // Exchange code for session with our code verifier
            // Make direct HTTP call since SDK doesn't pass our verifier
            const tokenResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "ApiKey": SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                auth_code: code,
                code_verifier: codeVerifier,
              }),
            });

            if (!tokenResponse.ok) {
              const errorData = await tokenResponse.json().catch(() => ({})) as { error_description?: string; error?: string };
              throw new Error(errorData.error_description || errorData.error || "Token exchange failed");
            }

            const tokenData = await tokenResponse.json() as { access_token: string; refresh_token: string; expires_at?: number };
            session = {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expires_at: tokenData.expires_at || Math.floor(Date.now() / 1000) + 3600,
            };

            // Get user info
            const { data: userData, error: userError } = await supabase.auth.getUser(tokenData.access_token);
            if (userError || !userData.user) {
              throw new Error(userError?.message || "Failed to get user");
            }
            user = userData.user;
          }

          // Extract GitHub info from user metadata
          const githubUsername =
            user.user_metadata?.user_name ||
            user.user_metadata?.preferred_username ||
            user.email?.split("@")[0] ||
            "unknown";
          const githubId =
            user.user_metadata?.provider_id || user.id;

          // Create user profile
          const userProfile: UserProfile = {
            id: user.id,
            githubUsername,
            githubId,
            analyticsOptIn: false,
            createdAt: user.created_at || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Save tokens
          const tokens: AuthTokens = {
            accessToken: session.access_token,
            refreshToken: session.refresh_token || "",
            expiresAt: session.expires_at
              ? session.expires_at * 1000
              : Date.now() + 3600000,
            user: userProfile,
          };

          saveAuthTokens(tokens);

          // Reset client to pick up new tokens
          resetClient();

          // Upsert user profile in database (must be before machine registration due to FK)
          await upsertUserProfile(userProfile);

          // Register machine if not exists
          await registerMachine(userProfile.id);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Authentication Successful!</h1>
                <p>Welcome, ${githubUsername}!</p>
                <p>You can close this window and return to the terminal.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);

          server.close();
          resolve(userProfile);
        } catch (err) {
          console.error("Token exchange error:", err);
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Authentication Failed</h1>
                <p>${(err as Error).message}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(OAUTH_CALLBACK_PORT, async () => {
      // Build OAuth URL manually to ensure proper PKCE handling
      const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
      authUrl.searchParams.set("provider", "github");
      authUrl.searchParams.set("redirect_to", OAUTH_CALLBACK_URL);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("scopes", "read:user user:email");

      // Store the code verifier for the callback
      // The Supabase client needs this, so we set it in the auth storage
      // We'll use a workaround by setting it before the exchange
      (globalThis as any).__cogcommit_code_verifier = codeVerifier;

      const oauthUrl = authUrl.toString();

      console.log("\nOpening browser for GitHub authentication...");
      console.log("If the browser doesn't open, visit this URL:");
      console.log(`  ${oauthUrl}\n`);

      try {
        await open.default(oauthUrl);
      } catch {
        // Browser didn't open, user will need to copy URL
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out"));
    }, 5 * 60 * 1000);
  });
}

/**
 * Logout and clear stored tokens
 */
export async function logout(): Promise<void> {
  const tokens = loadAuthTokens();

  if (tokens) {
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore signout errors
    }
  }

  clearAuthTokens();
}

/**
 * Refresh the access token if needed
 */
export async function refreshTokenIfNeeded(): Promise<boolean> {
  const tokens = loadAuthTokens();

  if (!tokens) {
    return false;
  }

  // Refresh if token expires in less than 5 minutes
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() < tokens.expiresAt - fiveMinutes) {
    return true; // Token still valid
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: tokens.refreshToken,
    });

    if (error || !data.session) {
      clearAuthTokens();
      return false;
    }

    const session = data.session;
    const newTokens: AuthTokens = {
      ...tokens,
      accessToken: session.access_token,
      refreshToken: session.refresh_token || tokens.refreshToken,
      expiresAt: session.expires_at
        ? session.expires_at * 1000
        : Date.now() + 3600000,
    };

    saveAuthTokens(newTokens);
    return true;
  } catch {
    clearAuthTokens();
    return false;
  }
}

/**
 * Register this machine with the cloud
 */
async function registerMachine(userId: string): Promise<void> {
  const supabase = getAuthenticatedClient();
  const machineId = getMachineId();
  const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME || "unknown";

  const { error } = await supabase.from("machines").upsert(
    {
      user_id: userId,
      machine_id: machineId,
      name: hostname,
      last_sync_at: new Date().toISOString(),
    },
    { onConflict: "user_id,machine_id" }
  );

  if (error) {
    console.error("Failed to register machine:", error.message);
    throw new Error(`Failed to register machine: ${error.message}`);
  }
}

/**
 * Upsert user profile in database
 */
async function upsertUserProfile(profile: UserProfile): Promise<void> {
  const supabase = getAuthenticatedClient();

  const { error } = await supabase.from("user_profiles").upsert(
    {
      id: profile.id,
      github_username: profile.githubUsername,
      github_id: profile.githubId,
      analytics_opt_in: profile.analyticsOptIn,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("Failed to upsert user profile:", error.message);
    throw new Error(`Failed to upsert user profile: ${error.message}`);
  }
}

/**
 * Sign in anonymously
 * Creates an anonymous account that can be claimed later
 */
export async function signInAnonymously(): Promise<UserProfile | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error || !data.session || !data.user) {
    return null;
  }

  // Create user profile for anonymous user
  const userProfile: UserProfile = {
    id: data.user.id,
    githubUsername: `anon-${data.user.id.substring(0, 8)}`,
    githubId: "",
    analyticsOptIn: true,
    isAnonymous: true,
    createdAt: data.user.created_at || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save tokens
  const tokens: AuthTokens = {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token || "",
    expiresAt: data.session.expires_at
      ? data.session.expires_at * 1000
      : Date.now() + 3600000,
    user: userProfile,
  };

  saveAuthTokens(tokens);

  // Reset client to pick up new tokens
  resetClient();

  // Upsert user profile in database
  await upsertUserProfile(userProfile);

  // Register machine
  await registerMachine(userProfile.id);

  return userProfile;
}

/**
 * Ensure user is authenticated, using anonymous auth if needed
 * Returns user profile, or null if auth fails
 */
export async function ensureAuthenticated(): Promise<UserProfile | null> {
  // Already authenticated?
  const tokens = loadAuthTokens();
  if (tokens?.user) {
    return tokens.user;
  }

  // Try anonymous sign-in
  return signInAnonymously();
}

/**
 * Claim anonymous account by linking GitHub identity
 * User ID stays the same - all data automatically claimed
 */
export async function claimAccount(): Promise<UserProfile> {
  const tokens = loadAuthTokens();
  if (!tokens?.user) {
    throw new Error("No account to claim. Run 'tuhnr start' first.");
  }

  if (!tokens.user.isAnonymous) {
    throw new Error("Account already claimed.");
  }

  const supabase = getSupabaseClient();

  // Generate PKCE codes for the OAuth flow
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return new Promise((resolve, reject) => {
    // Create a temporary server to handle the OAuth callback
    const server = createServer(async (req, res) => {
      const url = parseUrl(req.url || "", true);

      if (url.pathname === "/auth/callback") {
        const code = url.query.code as string;
        const accessToken = url.query.access_token as string;
        const refreshToken = url.query.refresh_token as string;
        const error = url.query.error as string;
        const errorDescription = url.query.error_description as string;

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Claim Failed</h1>
                <p>${error}: ${errorDescription || ""}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`OAuth error: ${error} - ${errorDescription || ""}`));
          return;
        }

        // If no code and no tokens in query, serve a page that extracts from hash
        if (!code && !accessToken) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Processing claim...</h1>
                <p id="status">Extracting tokens...</p>
                <script>
                  const hash = window.location.hash.substring(1);
                  if (hash) {
                    const params = new URLSearchParams(hash);
                    const accessToken = params.get('access_token');
                    const refreshToken = params.get('refresh_token');
                    if (accessToken) {
                      window.location.href = '/auth/callback?access_token=' + encodeURIComponent(accessToken) +
                        '&refresh_token=' + encodeURIComponent(refreshToken || '');
                    } else {
                      document.getElementById('status').textContent = 'No tokens found in response';
                    }
                  } else {
                    document.getElementById('status').textContent = 'No authentication data received';
                  }
                </script>
              </body>
            </html>
          `);
          return;
        }

        try {
          let session;
          let user;

          if (accessToken) {
            // Tokens were passed directly (from hash extraction)
            const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
            if (userError || !userData.user) {
              throw new Error(userError?.message || "Failed to get user");
            }
            user = userData.user;
            session = {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            };
          } else {
            // Exchange code for session with our code verifier
            const tokenResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ApiKey: SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                auth_code: code,
                code_verifier: codeVerifier,
              }),
            });

            if (!tokenResponse.ok) {
              const errorData = (await tokenResponse.json().catch(() => ({}))) as {
                error_description?: string;
                error?: string;
              };
              throw new Error(errorData.error_description || errorData.error || "Token exchange failed");
            }

            const tokenData = (await tokenResponse.json()) as {
              access_token: string;
              refresh_token: string;
              expires_at?: number;
            };
            session = {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expires_at: tokenData.expires_at || Math.floor(Date.now() / 1000) + 3600,
            };

            // Get user info
            const { data: userData, error: userError } = await supabase.auth.getUser(tokenData.access_token);
            if (userError || !userData.user) {
              throw new Error(userError?.message || "Failed to get user");
            }
            user = userData.user;
          }

          // Extract GitHub info from user metadata
          const githubUsername =
            user.user_metadata?.user_name ||
            user.user_metadata?.preferred_username ||
            user.email?.split("@")[0] ||
            "unknown";
          const githubId = user.user_metadata?.provider_id || user.id;

          // Update user profile - keep the same ID (anonymous ID persists)
          const userProfile: UserProfile = {
            id: user.id,
            githubUsername,
            githubId,
            analyticsOptIn: tokens.user.analyticsOptIn,
            isAnonymous: false,
            createdAt: tokens.user.createdAt,
            updatedAt: new Date().toISOString(),
          };

          // Save updated tokens
          const newTokens: AuthTokens = {
            accessToken: session.access_token,
            refreshToken: session.refresh_token || "",
            expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000,
            user: userProfile,
          };

          saveAuthTokens(newTokens);

          // Reset client to pick up new tokens
          resetClient();

          // Update profile in cloud
          await upsertUserProfile(userProfile);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Account Claimed!</h1>
                <p>Welcome, ${githubUsername}!</p>
                <p>Your data is now linked to your GitHub account.</p>
                <p>You can close this window and return to the terminal.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);

          server.close();
          resolve(userProfile);
        } catch (err) {
          console.error("Claim error:", err);
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Claim Failed</h1>
                <p>${(err as Error).message}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(OAUTH_CALLBACK_PORT, async () => {
      // Use linkIdentity endpoint to add GitHub to anonymous account
      // This preserves the user ID
      const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
      authUrl.searchParams.set("provider", "github");
      authUrl.searchParams.set("redirect_to", OAUTH_CALLBACK_URL);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("scopes", "read:user user:email");

      const oauthUrl = authUrl.toString();

      console.log("\nOpening browser for GitHub authentication...");
      console.log("If the browser doesn't open, visit this URL:");
      console.log(`  ${oauthUrl}\n`);

      try {
        await open.default(oauthUrl);
      } catch {
        // Browser didn't open, user will need to copy URL
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Claim timed out"));
    }, 5 * 60 * 1000);
  });
}
