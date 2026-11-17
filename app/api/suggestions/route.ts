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
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { randomUUID } from "crypto";

// Allowlist of recognized image magic-byte signatures mapped to their
// extensions. Anything that doesn't match one of these (including SVG,
// which has no safe binary signature) is rejected.
const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
};

/**
 * Determine the real image type of a buffer by inspecting its magic bytes,
 * rather than trusting the client-supplied Content-Type header. Returns the
 * file extension to use (e.g. ".jpg") or null if the content doesn't match
 * any recognized image signature.
 */
async function detectImageExtension(buffer: Buffer): Promise<string | null> {
  const header = buffer.subarray(0, 12);

  // JPEG: FF D8 FF
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return IMAGE_EXTENSION_BY_TYPE.jpeg;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (header.length >= pngSignature.length && pngSignature.every((b, i) => header[i] === b)) {
    return IMAGE_EXTENSION_BY_TYPE.png;
  }

  // WebP: "RIFF" at bytes 0-3 and "WEBP" at bytes 8-11
  if (
    header.length >= 12 &&
    header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
  ) {
    return IMAGE_EXTENSION_BY_TYPE.webp;
  }

  // GIF: 47 49 46 38
  if (header.length >= 4 && header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
    return IMAGE_EXTENSION_BY_TYPE.gif;
  }

  return null;
}

/**
 * Build a safe, fully server-generated destination path for an uploaded
 * image inside uploadDir. The filename is never derived from user input
 * (file.name / file.type), only from a random UUID plus a validated
 * extension. As a defense-in-depth backstop, verifies the resolved path is
 * still contained within uploadDir before returning it.
 */
function safeImagePath(uploadDir: string, ext: string): { filename: string; fullPath: string } {
  const filename = `${randomUUID()}${ext}`;
  const fullPath = path.join(uploadDir, filename);

  const resolvedDir = path.resolve(uploadDir) + path.sep;
  const resolvedPath = path.resolve(fullPath);
  if (!resolvedPath.startsWith(resolvedDir)) {
    throw new Error("Resolved upload path escapes upload directory");
  }

  return { filename, fullPath };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let query = {};
    
    // Role-based filtering:
    // If the user is an Employee, they can only see their own suggestions.
    // Managers/Admins can see all suggestions.
    if (session.user.role === "Employee") {
      query = { author: session.user.id };
    }

    const suggestions = await Suggestion.find(query)
      .populate("author", "name nik")
      .populate("department", "name")
      .sort({ createdAt: -1 });

    return NextResponse.json(suggestions);
  } catch (error: any) {
    console.error("GET suggestions error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    if (additionalImages.length > 3) {
      return NextResponse.json({ error: "Maximum of 3 additional images allowed" }, { status: 400 });
    }

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
    const imagesToValidate = [beforeImage, afterImage, ...additionalImages].filter(
      (f): f is File => !!f && f.size > 0
    );

    for (const file of imagesToValidate) {
      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: "Image size must not exceed 5MB" }, { status: 400 });
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
      }
    }

    let beforeImagePath = "";
    let afterImagePath = "";
    const additionalImagePaths: string[] = [];

    const uploadDir = path.join(process.cwd(), "public/uploads");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    if (beforeImage && beforeImage.size > 0) {
      const buffer = Buffer.from(await beforeImage.arrayBuffer());
      const ext = await detectImageExtension(buffer);
      if (!ext) {
        return NextResponse.json({ error: "File bukan gambar yang valid" }, { status: 400 });
      }
      const { filename, fullPath } = safeImagePath(uploadDir, ext);
      await writeFile(fullPath, buffer);
      beforeImagePath = `/uploads/${filename}`;
    }

    if (afterImage && afterImage.size > 0) {
      const buffer = Buffer.from(await afterImage.arrayBuffer());
      const ext = await detectImageExtension(buffer);
      if (!ext) {
        return NextResponse.json({ error: "File bukan gambar yang valid" }, { status: 400 });
      }
      const { filename, fullPath } = safeImagePath(uploadDir, ext);
      await writeFile(fullPath, buffer);
      afterImagePath = `/uploads/${filename}`;
    }

    for (let i = 0; i < additionalImages.length; i++) {
      const file = additionalImages[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = await detectImageExtension(buffer);
      if (!ext) {
        return NextResponse.json({ error: "File bukan gambar yang valid" }, { status: 400 });
      }
      const { filename, fullPath } = safeImagePath(uploadDir, ext);
      await writeFile(fullPath, buffer);
      additionalImagePaths.push(`/uploads/${filename}`);
    }

    await connectToDatabase();

    if (status === "Draft") {
      const newSuggestion = await Suggestion.create({
        title,
        problem: problem || undefined,
        solution: solution || undefined,
        category: category || undefined,
        costEffective: {
          explanation: costEffectiveExplanation || "",
          nominal: costEffectiveNominal ? Number(costEffectiveNominal) : 0,
        },
        images: {
          before: beforeImagePath,
          after: afterImagePath,
          additional: additionalImagePaths,
        },
        status: "Draft",
        author: session.user.id,
        department: departmentId || undefined,
        pointsAwarded: 0,
      });

      return NextResponse.json(newSuggestion, { status: 201 });
    }

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Validate max 5 suggestions per month
    const currentMonthSuggestions = await Suggestion.countDocuments({
      author: session.user.id,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });

    if (currentMonthSuggestions >= 5) {
      return NextResponse.json({ error: "Anda telah mencapai batas maksimal 5 usulan untuk periode bulan ini." }, { status: 400 });
    }

    // Base participation points = 5
    const participationPoints = 5;

    const newSuggestion = await Suggestion.create({
      title,
      problem,
      solution,
      category,
      costEffective: {
        explanation: costEffectiveExplanation || "",
        nominal: costEffectiveNominal ? Number(costEffectiveNominal) : 0,
      },
      images: {
        before: beforeImagePath,
        after: afterImagePath,
        additional: additionalImagePaths,
      },
      status: "Pending",
      submittedAt: now,
      author: session.user.id,
      department: departmentId,
      pointsAwarded: participationPoints, // Initial points for submitting
    });

    // Update Gamification Points for User and Department (All-time)
    await User.findByIdAndUpdate(session.user.id, {
      $inc: { personalPoints: participationPoints }
    });

    await Department.findByIdAndUpdate(departmentId, {
      $inc: { totalPoints: participationPoints }
    });

    // Record PointLog for period-based tracking
    await PointLog.create({
      user: session.user.id,
      department: departmentId,
      suggestion: newSuggestion._id,
      points: participationPoints,
      type: "Submission",
      period: period
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
        link: `/dashboard/suggestions/${newSuggestion._id}`,
      }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    }

    return NextResponse.json(newSuggestion, { status: 201 });
  } catch (error: any) {
    console.error("POST suggestion error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
