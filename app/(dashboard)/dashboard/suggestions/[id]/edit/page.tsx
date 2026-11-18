"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import SuggestionWizard, {
  SuggestionFormData,
} from "@/components/suggestions/SuggestionWizard";

type Department = { _id: string; name: string };

/**
 * Task 13: builds the exact `multipart/form-data` body
 * `PUT /api/suggestions/[id]`'s Revision -> Pending branch parses (see
 * `app/api/suggestions/[id]/route.ts`) from the wizard's `SuggestionFormData`.
 * Unlike Task 12's create page, this page only ever resubmits — there is no
 * Draft status to target here — so `status` is always `"Pending"`.
 */
function buildResubmitFormData(data: SuggestionFormData): FormData {
  const formData = new FormData();
  formData.append("title", data.title);
  formData.append("category", data.category);
  formData.append("department", data.department);
  formData.append("problem", data.problem);
  formData.append("solution", data.solution);
  formData.append("costEffectiveExplanation", data.costEffectiveExplanation);
  formData.append("costEffectiveNominal", data.costEffectiveNominal);
  formData.append("status", "Pending");
  if (data.beforeImage) formData.append("beforeImage", data.beforeImage);
  if (data.afterImage) formData.append("afterImage", data.afterImage);
  for (const file of data.additionalImages) {
    formData.append("additionalImages", file);
  }
  return formData;
}

/** Best-effort extraction of the route's `{ error: string }` body, falling
 * back to a generic message when the body isn't JSON (e.g. a 500 from an
 * unexpected crash) — this is what `SuggestionWizard`'s `extractErrorMessage`
 * (Task 10) ends up displaying. Same helper as Task 12's create page. */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string" && body.error.trim().length > 0) {
      return body.error;
    }
  } catch {
    // Non-JSON body — fall through to the generic message.
  }
  return fallback;
}

type LoadedRevision = Partial<SuggestionFormData> & { updatedAt?: string };

/** Shape of the fields this page actually reads off `GET /api/suggestions/{id}`'s
 * response — `author`/`department` may arrive populated (an object with
 * `_id`) or, in principle, as a raw id string; both are handled below. */
type FetchedSuggestion = {
  _id: string;
  status: string;
  author: { _id: string } | string;
  department?: { _id: string } | string | null;
  title?: string;
  category?: string;
  problem?: string;
  solution?: string;
  costEffective?: { explanation?: string; nominal?: number };
  updatedAt?: string;
};

function idOf(value: { _id: string } | string | null | undefined): string {
  if (!value) return "";
  return typeof value === "object" ? value._id ?? "" : value;
}

export default function EditRevisionSuggestionPage() {
  const router = useRouter();
  const params = useParams();
  const suggestionId = params?.id as string;
  const { data: session, status: sessionStatus } = useSession();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [doc, setDoc] = useState<FetchedSuggestion | null>(null);
  // Starts "loading" and only ever moves to "ready" (data in hand, still
  // pending the authorization check below) or "error" (fetch failed — a
  // redirect is already in flight by the time this is set). Modeled on
  // Task 12's `loadingDraft` gate: `SuggestionWizard` must never mount
  // before real `initialData` is ready, so nothing here renders it until
  // this reaches "ready" AND the authorization check below passes.
  const [fetchStatus, setFetchStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => {
        // Advisory only — an empty department list just leaves the select empty.
      });
  }, []);

  // Step 1: fetch the suggestion on mount. This alone doesn't decide
  // authorization (session may still be resolving) — a 404/403/network
  // failure here is unconditionally wrong, though, so those redirect right
  // away without waiting on the session.
  useEffect(() => {
    if (!suggestionId) return;
    let cancelled = false;

    fetch(`/api/suggestions/${suggestionId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setFetchStatus("error");
          router.replace(`/dashboard/suggestions/${suggestionId}`);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setDoc(data);
        setFetchStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setFetchStatus("error");
        router.replace(`/dashboard/suggestions/${suggestionId}`);
      });

    return () => {
      cancelled = true;
    };
  }, [suggestionId, router]);

  // Step 1 (continued): once both the fetch and the session have resolved,
  // decide whether this user may actually edit this suggestion right now —
  // redirecting away for EITHER "not a Revision" or "not the author". Depends
  // on `session` (not `isAuthor`/`authorized` below) because those are
  // derived fresh every render and don't belong in a dependency array.
  useEffect(() => {
    if (fetchStatus !== "ready" || sessionStatus === "loading" || !doc) return;
    const isAuthor = session?.user?.id === idOf(doc.author);
    if (doc.status !== "Revision" || !isAuthor) {
      router.replace(`/dashboard/suggestions/${suggestionId}`);
    }
  }, [fetchStatus, sessionStatus, doc, session, suggestionId, router]);

  const isAuthor = doc ? session?.user?.id === idOf(doc.author) : false;
  const authorized =
    fetchStatus === "ready" &&
    sessionStatus !== "loading" &&
    !!doc &&
    doc.status === "Revision" &&
    isAuthor;

  // Only built once authorized — nothing reads `wizardInitialData` before
  // that, but keeping the computation itself unconditional avoids a
  // conditional hook-adjacent dependency.
  const wizardInitialData: LoadedRevision | undefined =
    doc && authorized
      ? {
          title: doc.title ?? "",
          category: doc.category ?? "",
          department: idOf(doc.department),
          problem: doc.problem ?? "",
          solution: doc.solution ?? "",
          costEffectiveExplanation: doc.costEffective?.explanation ?? "",
          costEffectiveNominal:
            doc.costEffective?.nominal != null ? String(doc.costEffective.nominal) : "",
          // Critical for Task 11's resume-prompt comparison — see the brief.
          updatedAt: doc.updatedAt,
        }
      : undefined;

  // Step 2: "Simpan Draft" is never shown in `mode="revise"` (see the
  // `mode !== "revise"` guard added to `SuggestionWizard` for Task 13), so
  // this is never actually invoked — it only exists to satisfy
  // `SuggestionWizardProps.onSaveDraft`'s required, non-optional type.
  const handleSaveDraft = useCallback(async (): Promise<{ _id: string }> => {
    return { _id: suggestionId };
  }, [suggestionId]);

  // Step 3: resubmit. `PUT /api/suggestions/{id}` with `status: "Pending"` —
  // the Revision -> Pending branch in `app/api/suggestions/[id]/route.ts`,
  // which snapshots the pre-edit fields onto `revisionHistory` server-side.
  const handleSubmit = useCallback(
    async (data: SuggestionFormData): Promise<void> => {
      const formData = buildResubmitFormData(data);
      const res = await fetch(`/api/suggestions/${suggestionId}`, {
        method: "PUT",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(
          await readErrorMessage(res, "Gagal mengirim revisi. Silakan coba lagi.")
        );
      }

      router.push(`/dashboard/suggestions/${suggestionId}`);
    },
    [suggestionId, router]
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/suggestions/${suggestionId}`}
            className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-slate-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight font-display">
              Revisi Usulan
            </h1>
            <p className="text-gray-500 text-sm">
              Perbaiki usulanmu sesuai catatan reviewer, lalu ajukan kembali.
            </p>
          </div>
        </div>
      </div>

      {!authorized || !wizardInitialData ? (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-500">
          Memuat...
        </div>
      ) : (
        <SuggestionWizard
          mode="revise"
          initialData={wizardInitialData}
          draftId={suggestionId}
          departments={departments}
          onSaveDraft={handleSaveDraft}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
