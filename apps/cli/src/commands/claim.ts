/**
 * Claim command - Link anonymous account to GitHub
 */

import { Command } from "commander";
import { isAuthenticated, getCurrentUser, isCloudAvailable } from "../sync/client";
import { claimAccount } from "../sync/auth";
import { TuhnrDB } from "../storage/db";
import { isInitialized } from "../config";

export function registerClaimCommand(program: Command): void {
  program
    .command("claim")
    .description("Claim your anonymous account with GitHub")
    .action(async () => {
      try {
        if (!isCloudAvailable()) {
          console.error("Cloud sync is not configured.");
          process.exit(1);
        }

        if (!isAuthenticated()) {
          console.error("No account to claim. Run 'tuhnr start' first.");
          process.exit(1);
        }

        const user = getCurrentUser();
        if (!user?.isAnonymous) {
          console.log("Account already claimed!");
          console.log(`Signed in as: ${user?.githubUsername}`);
          return;
        }

        // Get commit count to show in success message
        let commitCount = 0;
        const projectPath = process.cwd();
        if (isInitialized(projectPath)) {
          const db = new TuhnrDB(projectPath);
          commitCount = db.commits.getCount();
          db.close();
        }

        console.log("Claiming your account with GitHub...\n");

        const profile = await claimAccount();

        console.log(`\nAccount claimed!`);
        console.log(`Signed in as: ${profile.githubUsername}`);
        if (commitCount > 0) {
          console.log(`\nYour ${commitCount} commits are now linked to your GitHub account.`);
        }
        console.log("You can now access them from any device at tuhnr.com");
        process.exit(0);
      } catch (error) {
        console.error(`Claim failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
