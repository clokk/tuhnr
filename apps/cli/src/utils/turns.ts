/**
 * Turn counting utilities
 *
 * A "turn" = one user prompt → Claude's complete response cycle
 *
 * Since tool_result messages don't create user turns (handled in parser),
 * counting user-role turns gives us the meaningful "prompts from user" count.
 */

import type { Session } from "../models/types";

/**
 * Count meaningful turns (user prompts only) across sessions
 */
export function countTurns(sessions: Session[]): number {
  return sessions.reduce((total, session) => {
    return total + session.turns.filter((t) => t.role === "user").length;
  }, 0);
}
