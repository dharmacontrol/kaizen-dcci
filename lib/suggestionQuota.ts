/**
 * Shared monthly-quota query shape, used by every endpoint that needs to
 * count a user's non-Draft suggestions for a given month.
 *
 * Counting by `createdAt` alone is wrong: a Draft finalized in a later
 * month than it was created keeps its original `createdAt`, so it would be
 * invisible to a `createdAt`-based query in the month it actually counts
 * against — letting a user exceed the monthly cap by finalizing old drafts
 * then submitting fresh ones directly. Counting by `submittedAt` (falling
 * back to `createdAt` only when `submittedAt` doesn't exist, e.g. legacy
 * documents) fixes that.
 */
export function buildMonthlyQuotaQuery(
  authorId: string,
  startOfMonth: Date,
  endOfMonth: Date
  // Returns `any` deliberately: Suggestion.countDocuments(...)'s overload
  // resolution in this codebase's Mongoose version only succeeds against a
  // literal object argument (see the inline queries this was extracted
  // from) — a precisely-typed return value here makes TS fail to match any
  // overload (TS2769) once the object is passed in via a variable/call
  // instead of a literal. Matches the same "No overload matches this call"
  // tradeoff already present elsewhere in this codebase's Mongoose calls
  // (e.g. app/api/news/route.ts's `query` variable).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return {
    author: authorId,
    status: { $ne: "Draft" },
    $or: [
      { submittedAt: { $gte: startOfMonth, $lte: endOfMonth } },
      { submittedAt: { $exists: false }, createdAt: { $gte: startOfMonth, $lte: endOfMonth } },
    ],
  };
}
