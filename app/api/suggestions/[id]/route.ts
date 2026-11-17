import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectToDatabase from "@/lib/mongodb";
import Suggestion, { ISuggestion } from "@/models/Suggestion";
import User from "@/models/User";
import Department from "@/models/Department";
import Role from "@/models/Role";
import Notification from "@/models/Notification";
import PointLog from "@/models/PointLog";
import { saveSuggestionImage, validateSuggestionImage } from "@/lib/suggestionUploads";
import { buildMonthlyQuotaQuery } from "@/lib/suggestionQuota";

// Same cap enforced client-side in components/suggestions/SuggestionWizard.tsx
// (MAX_ADDITIONAL_IMAGES) and in the sibling POST handler's per-request check.
const MAX_ADDITIONAL_IMAGES = 3;

export async function GET(req: NextRequest, context: { params: any }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id } = await context.params;
    const suggestion = await Suggestion.findById(id)
      .populate("author", "name nik role")
      .populate("department", "name")
      .populate("comments.author", "name role")
      .populate("revisionHistory.department", "name");

    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    // Author-only guard: Drafts are private scratch work and must not be
    // visible to anyone but the author (not even other employees/managers
    // via this endpoint). `author` may be a populated sub-document (has
    // `_id`) or a raw ObjectId depending on population, so check both shapes.
    const authorId = (suggestion.author as any)?._id
      ? (suggestion.author as any)._id.toString()
      : suggestion.author.toString();

    if (suggestion.status === "Draft" && authorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(suggestion);
  } catch (error: any) {
    console.error("GET suggestion details error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: any }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only SectionHead or Admin should be able to approve
    if (session.user.role === "Employee") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { status, costImpact, assessment } = await req.json();
    if (!status || !["Approved", "Rejected", "Revision"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await connectToDatabase();
    const { id } = await context.params;
    const suggestion = await Suggestion.findById(id);

    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    // If it's already approved, don't award points again
    if (suggestion.status === "Approved") {
      return NextResponse.json({ error: "Suggestion is already approved" }, { status: 400 });
    }

    suggestion.status = status;

    let bonusPoints = 0;
    if (status === "Approved") {
      if (assessment) {
        suggestion.assessment = assessment;
        const sqcdmpe = assessment.sqcdmpe || {};
        bonusPoints = 
          (assessment.original || 0) +
          (assessment.hoshinKanri || 0) +
          (assessment.yokoten || 0) +
          (sqcdmpe.safety || 0) +
          (sqcdmpe.quality || 0) +
          (sqcdmpe.cost || 0) +
          (sqcdmpe.delivery || 0) +
          (sqcdmpe.morale || 0) +
          (sqcdmpe.productivity || 0) +
          (sqcdmpe.environment || 0) +
          (sqcdmpe.peopleDevelopment || 0);
      } else {
        // Fallback just in case
        bonusPoints = 0;
      }

      suggestion.pointsAwarded += bonusPoints;
      
      // Award points to the user and department
      await User.findByIdAndUpdate(suggestion.author, {
        $inc: { personalPoints: bonusPoints }
      });
      await Department.findByIdAndUpdate(suggestion.department, {
        $inc: { totalPoints: bonusPoints }
      });

      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      await PointLog.create({
        user: suggestion.author,
        department: suggestion.department,
        suggestion: suggestion._id,
        points: bonusPoints,
        type: "Approval",
        period: period
      });
    }

    if (costImpact !== undefined && !isNaN(Number(costImpact))) {
      suggestion.costImpact = Number(costImpact);
    }

    await suggestion.save();

    // Create Notification for the author
    let message = "";
    let type: "INFO" | "SUCCESS" | "WARNING" | "ACTION" = "INFO";
    if (status === "Approved") {
      message = `Your suggestion has been Approved! You earned +${bonusPoints} points.`;
      type = "SUCCESS";
    } else if (status === "Rejected") {
      message = `Your suggestion has been Rejected.`;
      type = "WARNING";
    } else if (status === "Revision") {
      message = `Your suggestion requires Revision.`;
      type = "ACTION";
    }

    await Notification.create({
      recipient: suggestion.author,
      type,
      title: `Suggestion ${status}`,
      message,
      link: `/dashboard/suggestions/${suggestion._id}`,
    });

    return NextResponse.json(suggestion);
  } catch (error: any) {
    console.error("PATCH suggestion error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/suggestions/[id] - author-only endpoint covering three legal
 * transitions, branched on the document's CURRENT (pre-update) status:
 *
 *   - Draft -> Draft (status: "Draft"): plain field update. No
 *     revisionHistory push, no submittedAt change, no points/quota.
 *   - Draft -> Pending (status: "Pending"): finalize. Runs the same quota
 *     check POST runs, sets submittedAt, awards the 5 participation
 *     points + PointLog + manager notifications (mirroring POST's
 *     Pending-path side effects). No revisionHistory push.
 *   - Revision -> Pending (status: "Pending"): resubmit. Snapshots the
 *     document's pre-update values onto revisionHistory, then updates
 *     fields and sets status back to Pending. submittedAt is left
 *     untouched and no quota/points side effects run - this idea already
 *     counted once toward both at its original submission.
 *
 * Any other (currentStatus, requestedStatus) combination is rejected with
 * 400. A reviewer should not be able to use this endpoint at all - that's
 * still PATCH - so a non-author is rejected with 403 regardless of status.
 */
export async function PUT(req: NextRequest, context: { params: any }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();

    const statusField = formData.get("status");
    const status = statusField === null ? "Pending" : (statusField as string);
    if (status !== "Draft" && status !== "Pending") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const title = formData.get("title") as string;
    const problem = formData.get("problem") as string;
    const solution = formData.get("solution") as string;
    const category = formData.get("category") as ISuggestion["category"];
    const departmentId = formData.get("department") as string;
    const costEffectiveExplanation = formData.get("costEffectiveExplanation") as string;
    const costEffectiveNominal = formData.get("costEffectiveNominal") as string;

    if (status === "Pending") {
      if (!title || !problem || !solution || !category || !departmentId) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
    } else {
      if (!title) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
    }

    const beforeImage = formData.get("beforeImage") as File | null;
    const afterImage = formData.get("afterImage") as File | null;
    const additionalImagesRaw = formData.getAll("additionalImages");
    const additionalImages = additionalImagesRaw.filter(
      (f): f is File => f instanceof File && f.size > 0
    );

    if (additionalImages.length > MAX_ADDITIONAL_IMAGES) {
      return NextResponse.json({ error: "Maximum of 3 additional images allowed" }, { status: 400 });
    }

    const imagesToValidate = [beforeImage, afterImage, ...additionalImages].filter(
      (f): f is File => !!f && f.size > 0
    );

    for (const file of imagesToValidate) {
      const validationError = validateSuggestionImage(file);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    await connectToDatabase();
    const { id } = await context.params;
    const suggestion = await Suggestion.findById(id);

    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    if (suggestion.author.toString() !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const currentStatus = suggestion.status;
    const isValidTransition =
      (currentStatus === "Draft" && (status === "Draft" || status === "Pending")) ||
      (currentStatus === "Revision" && status === "Pending");

    if (!isValidTransition) {
      return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
    }

    // Resolve image paths: use newly uploaded files when provided, otherwise
    // retain the suggestion's existing images. A file input can't "keep" a
    // previous selection across page loads, so an omitted file field means
    // "no change to this image", not "clear this image".
    let beforeImagePath = suggestion.images?.before || "";
    let afterImagePath = suggestion.images?.after || "";
    let additionalImagePaths: string[] = suggestion.images?.additional
      ? [...suggestion.images.additional]
      : [];

    try {
      if (beforeImage && beforeImage.size > 0) {
        beforeImagePath = await saveSuggestionImage(beforeImage);
      }

      if (afterImage && afterImage.size > 0) {
        afterImagePath = await saveSuggestionImage(afterImage);
      }

      if (additionalImages.length > 0) {
        // Append newly-uploaded additional images to the EXISTING array
        // rather than replacing it. The wizard doesn't currently load a
        // Draft/Revision's existing additional-image URLs into its own
        // state (a separate, already-tracked limitation), so a request
        // that adds one new photo to an idea that already has some stored
        // only contains that one new file — replacing the whole array
        // would silently wipe out the previously-stored ones. Capped at
        // MAX_ADDITIONAL_IMAGES total: if the combined count would exceed
        // the cap, keep the existing ones and only append as many new ones
        // as fit (advisory UX cap, not a hard validation failure).
        const newAdditionalPaths: string[] = [];
        for (const file of additionalImages) {
          newAdditionalPaths.push(await saveSuggestionImage(file));
        }
        const remainingSlots = Math.max(
          0,
          MAX_ADDITIONAL_IMAGES - additionalImagePaths.length
        );
        additionalImagePaths = [
          ...additionalImagePaths,
          ...newAdditionalPaths.slice(0, remainingSlots),
        ];
      }
    } catch (err) {
      return NextResponse.json({ error: "File bukan gambar yang valid" }, { status: 400 });
    }

    const now = new Date();

    // Branch 1: Draft -> Draft. Plain field update.
    if (currentStatus === "Draft" && status === "Draft") {
      suggestion.title = title;
      suggestion.problem = problem || undefined;
      suggestion.solution = solution || undefined;
      suggestion.category = category || undefined;
      suggestion.department = (departmentId || undefined) as any;
      suggestion.costEffective = {
        explanation: costEffectiveExplanation || "",
        nominal: costEffectiveNominal ? Number(costEffectiveNominal) : 0,
      };
      suggestion.images = {
        before: beforeImagePath,
        after: afterImagePath,
        additional: additionalImagePaths,
      };

      await suggestion.save();
      return NextResponse.json(suggestion);
    }

    // Branch 2: Draft -> Pending. Finalize: quota check + participation
    // points + PointLog + manager notifications, mirroring POST.
    if (currentStatus === "Draft" && status === "Pending") {
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // Same quota check as GET /api/suggestions/quota (Task 2): count by
      // submittedAt, not createdAt, since a Draft can be created in an
      // earlier month and finalized later — counting by createdAt would
      // never match this month's range and would bypass the cap entirely.
      // status: { $ne: "Draft" } also excludes the draft being finalized
      // from its own count (its status field in the DB is still "Draft"
      // at this point), so it is not double-counted against the cap it is
      // merely transitioning within, not adding to.
      const currentMonthSuggestions = await Suggestion.countDocuments(
        buildMonthlyQuotaQuery(session.user.id, startOfMonth, endOfMonth)
      );

      if (currentMonthSuggestions >= 5) {
        return NextResponse.json({ error: "Anda telah mencapai batas maksimal 5 usulan untuk periode bulan ini." }, { status: 400 });
      }

      const participationPoints = 5;

      suggestion.title = title;
      suggestion.problem = problem;
      suggestion.solution = solution;
      suggestion.category = category;
      suggestion.department = departmentId as any;
      suggestion.costEffective = {
        explanation: costEffectiveExplanation || "",
        nominal: costEffectiveNominal ? Number(costEffectiveNominal) : 0,
      };
      suggestion.images = {
        before: beforeImagePath,
        after: afterImagePath,
        additional: additionalImagePaths,
      };
      suggestion.status = "Pending";
      suggestion.submittedAt = now;
      suggestion.pointsAwarded = participationPoints;

      await suggestion.save();

      // Update Gamification Points for User and Department (All-time)
      await User.findByIdAndUpdate(session.user.id, {
        $inc: { personalPoints: participationPoints },
      });

      await Department.findByIdAndUpdate(departmentId, {
        $inc: { totalPoints: participationPoints },
      });

      // Record PointLog for period-based tracking
      await PointLog.create({
        user: session.user.id,
        department: departmentId,
        suggestion: suggestion._id,
        points: participationPoints,
        type: "Submission",
        period: period,
      });

      // Notify users with canManageSuggestions
      const managerRoles = await Role.find({ "permissions.canManageSuggestions": true }).select("_id");
      const managerRoleIds = managerRoles.map(r => r._id);

      if (managerRoleIds.length > 0) {
        const managers = await User.find({ role: { $in: managerRoleIds } }).select("_id");

        const notifications = managers.map(manager => ({
          recipient: manager._id,
          type: "INFO",
          title: "New Suggestion Submitted",
          message: `${session.user.name} submitted a new suggestion in the ${category} category.`,
          link: `/dashboard/suggestions/${suggestion._id}`,
        }));

        if (notifications.length > 0) {
          await Notification.insertMany(notifications);
        }
      }

      return NextResponse.json(suggestion);
    }

    // Branch 3: Revision -> Pending. Resubmit: snapshot pre-update values
    // onto revisionHistory, then update fields. No quota re-check, no
    // participation points, no submittedAt change - this idea already
    // counted once toward both at its original submission.
    suggestion.revisionHistory = suggestion.revisionHistory || [];
    suggestion.revisionHistory.push({
      title: suggestion.title,
      problem: suggestion.problem,
      solution: suggestion.solution,
      category: suggestion.category,
      department: suggestion.department,
      costEffective: suggestion.costEffective,
      images: suggestion.images,
      editedAt: now,
    } as any);

    suggestion.title = title;
    suggestion.problem = problem;
    suggestion.solution = solution;
    suggestion.category = category;
    suggestion.department = departmentId as any;
    suggestion.costEffective = {
      explanation: costEffectiveExplanation || "",
      nominal: costEffectiveNominal ? Number(costEffectiveNominal) : 0,
    };
    suggestion.images = {
      before: beforeImagePath,
      after: afterImagePath,
      additional: additionalImagePaths,
    };
    suggestion.status = "Pending";
    // submittedAt intentionally left untouched.

    await suggestion.save();
    return NextResponse.json(suggestion);
  } catch (error: any) {
    console.error("PUT suggestion error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
