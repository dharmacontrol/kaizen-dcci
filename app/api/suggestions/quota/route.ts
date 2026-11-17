import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import Suggestion from "@/models/Suggestion";
import { buildMonthlyQuotaQuery } from "@/lib/suggestionQuota";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await Suggestion.countDocuments(
      buildMonthlyQuotaQuery(session.user.id, startOfMonth, endOfMonth)
    );

    return NextResponse.json({ used: count, max: 5, period });
  } catch (error: any) {
    console.error("GET quota error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
