import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import Suggestion from "@/models/Suggestion";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.permissions?.canManageSuggestions) {
    return NextResponse.json({ pendingApprovals: 0 });
  }

  await connectToDatabase();
  const pendingApprovals = await Suggestion.countDocuments({ status: "Pending" });

  return NextResponse.json({ pendingApprovals });
}
