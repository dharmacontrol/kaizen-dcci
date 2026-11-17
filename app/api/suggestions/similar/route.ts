import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findSimilarSuggestions } from "@/lib/suggestionSimilarity";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, problem, department, excludeId } = body;

    if (!title || !department) {
      return NextResponse.json(
        { error: "Missing required fields: title and department" },
        { status: 400 }
      );
    }

    const matches = await findSimilarSuggestions({
      title,
      problem: problem || "",
      department,
      excludeId,
    });

    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error("POST similar error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
