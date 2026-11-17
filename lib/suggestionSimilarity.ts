import connectToDatabase from "@/lib/mongodb";
import Suggestion from "@/models/Suggestion";

const STOPWORDS = new Set([
  "yang",
  "dan",
  "di",
  "ke",
  "dari",
  "untuk",
  "the",
  "a",
  "an",
  "and",
  "to",
  "of",
]);

export function tokenize(text: string): Set<string> {
  // Convert to lowercase and strip punctuation
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));

  return new Set(normalized);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  // If both empty, return 0
  if (a.size === 0 && b.size === 0) {
    return 0;
  }

  // Calculate intersection
  const intersection = new Set([...a].filter((x) => b.has(x)));

  // Calculate union
  const union = new Set([...a, ...b]);

  // Return |intersection| / |union|
  return intersection.size / union.size;
}

export async function findSimilarSuggestions(params: {
  title: string;
  problem: string;
  department: string;
  excludeId?: string;
}): Promise<{ _id: string; title: string; score: number }[]> {
  await connectToDatabase();

  // Query suggestions from the same department from the last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const query: Record<string, any> = {
    department: params.department,
    createdAt: { $gte: sixMonthsAgo },
    status: { $ne: "Draft" },
  };

  if (params.excludeId) {
    query._id = { $ne: params.excludeId };
  }

  const suggestions = await Suggestion.find(query)
    .select("title problem")
    .lean();

  // Calculate similarity scores
  const inputTokens = tokenize(params.title + " " + params.problem);
  const matches = suggestions
    .map((suggestion) => {
      const candidateTokens = tokenize(
        suggestion.title + " " + (suggestion.problem || "")
      );
      const score = jaccardSimilarity(inputTokens, candidateTokens);

      return {
        _id: suggestion._id.toString(),
        title: suggestion.title,
        score,
      };
    })
    .filter((match) => match.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return matches;
}
