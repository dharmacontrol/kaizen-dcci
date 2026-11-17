"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import SuggestionWizard, {
  SuggestionFormData,
} from "@/components/suggestions/SuggestionWizard";

type Department = { _id: string; name: string };

/**
 * Task 12: builds the exact `multipart/form-data` body both
 * `POST /api/suggestions` and `PUT /api/suggestions/[id]` parse (see those
 * route files) from the wizard's `SuggestionFormData`. `status` is always
 * included explicitly — never left to the routes' "no status field ->
 * Pending" default — so the draft/submit distinction is unambiguous here.
 */
function buildSuggestionFormData(
  data: SuggestionFormData,
  status: "Draft" | "Pending"
): FormData {
  const formData = new FormData();
  formData.append("title", data.title);
  formData.append("category", data.category);
  formData.append("department", data.department);
  formData.append("problem", data.problem);
  formData.append("solution", data.solution);
  formData.append("costEffectiveExplanation", data.costEffectiveExplanation);
  formData.append("costEffectiveNominal", data.costEffectiveNominal);
  formData.append("status", status);
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
 * (Task 10) ends up displaying. */
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

type LoadedDraft = Partial<SuggestionFormData> & { updatedAt?: string };

function CreateSuggestionWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const draftIdParam = searchParams.get("draftId");

  const [departments, setDepartments] = useState<Department[]>([]);
  // `draftId` is this page's own source of truth once a draft exists — it
  // starts from the URL, but `onSaveDraft` updates it directly (in addition
  // to the `router.replace` below) so the very next save/submit call uses
  // the right id even before the URL-driven re-render lands.
  const [draftId, setDraftId] = useState<string | undefined>(draftIdParam ?? undefined);
  const [initialData, setInitialData] = useState<LoadedDraft | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState<boolean>(Boolean(draftIdParam));

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => {
        // Advisory only — an empty department list just leaves the select empty.
      });
  }, []);

  // Step 1: resolve `?draftId=` — reactively, so a genuinely external change
  // to the URL's draftId (browser back/forward, a manual URL edit) is
  // correctly re-fetched. The one case that must NOT trigger a re-fetch is
  // this page's own `router.replace` call inside `handleSaveDraft`'s first-
  // save branch (it only adds `?draftId=` to reflect a draft id that was
  // already applied via `setDraftId` — re-fetching it would force-unmount/
  // remount `SuggestionWizard` via the `loadingDraft` gate below and wipe
  // whatever the user has typed since). `skipNextFetchRef` absorbs exactly
  // that one self-triggered cycle: `handleSaveDraft` sets it to `true`
  // immediately before calling `router.replace`, and this effect's first run
  // after that resets it and bails out without fetching.
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    const idToLoad = draftIdParam;
    if (!idToLoad) return;

    let cancelled = false;

    // Deferred one microtask (rather than called synchronously here) solely
    // to satisfy `react-hooks/set-state-in-effect` — it still runs long
    // before `fetch`'s response (and thus before any paint), so a real
    // external draftId change still shows "Memuat draft..." immediately.
    void Promise.resolve().then(() => {
      if (!cancelled) setLoadingDraft(true);
    });

    fetch(`/api/suggestions/${idToLoad}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setDraftId(undefined);
          setInitialData(undefined);
          setLoadError(
            res.status === 403 || res.status === 404
              ? "Draft tidak ditemukan atau bukan milik Anda."
              : "Gagal memuat draft. Silakan coba lagi."
          );
          // Redirect to a plain `create` (no query param) rather than leaving
          // the page pointed at a draft it can't load.
          router.replace("/dashboard/suggestions/create");
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        const departmentId =
          data.department && typeof data.department === "object"
            ? data.department._id ?? ""
            : data.department ?? "";

        setDraftId(data._id);
        setInitialData({
          title: data.title ?? "",
          category: data.category ?? "",
          department: departmentId,
          problem: data.problem ?? "",
          solution: data.solution ?? "",
          costEffectiveExplanation: data.costEffective?.explanation ?? "",
          costEffectiveNominal:
            data.costEffective?.nominal ? String(data.costEffective.nominal) : "",
          // Critical for Task 11's resume-prompt comparison — see the brief.
          updatedAt: data.updatedAt,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDraftId(undefined);
        setInitialData(undefined);
        setLoadError("Gagal memuat draft. Silakan coba lagi.");
        router.replace("/dashboard/suggestions/create");
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });

    return () => {
      cancelled = true;
    };
  }, [draftIdParam, router]);

  // Step 3: POST when there's no draft yet, PUT once one exists.
  const handleSaveDraft = useCallback(
    async (data: SuggestionFormData): Promise<{ _id: string }> => {
      const formData = buildSuggestionFormData(data, "Draft");
      const res = draftId
        ? await fetch(`/api/suggestions/${draftId}`, { method: "PUT", body: formData })
        : await fetch("/api/suggestions", { method: "POST", body: formData });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Gagal menyimpan draft. Silakan coba lagi."));
      }

      const saved = await res.json();
      if (!draftId && saved?._id) {
        setDraftId(saved._id);
        // Add `?draftId=` to the URL without a full navigation. The draft-
        // fetch effect above is reactive to that param, so tell it (via the
        // ref) to skip the one fetch this triggers — the draft was just
        // saved from current in-memory state, there's nothing to re-fetch.
        skipNextFetchRef.current = true;
        router.replace(`/dashboard/suggestions/create?draftId=${saved._id}`);
      }
      return { _id: saved._id };
    },
    [draftId, router]
  );

  // Step 4: finalize an existing draft via PUT, or submit fresh via POST —
  // today's exact unchanged path when no draft was ever saved.
  const handleSubmit = useCallback(
    async (data: SuggestionFormData): Promise<void> => {
      const formData = buildSuggestionFormData(data, "Pending");
      const res = draftId
        ? await fetch(`/api/suggestions/${draftId}`, { method: "PUT", body: formData })
        : await fetch("/api/suggestions", { method: "POST", body: formData });

      if (!res.ok) {
        throw new Error(
          await readErrorMessage(res, "Gagal mengirim usulan. Silakan coba lagi.")
        );
      }

      router.push("/dashboard/suggestions");
    },
    [draftId, router]
  );

  // Step 2: default `department` from the session when not resuming a draft.
  // `useSession()` starts at `status === "loading"` with `data === undefined`
  // on the very first client render, before this component even finishes
  // mounting. `SuggestionWizard` only reads `initialData` via a mount-time
  // `useState` initializer, so if it mounted on that first render it would
  // permanently miss the session-derived default once `session` resolves on
  // a later render. The `sessionStatus === "loading"` branch added to the
  // render gate below keeps `SuggestionWizard` unmounted until the session
  // has actually resolved, so this value is correct by the time it mounts.
  const sessionDepartment = (session?.user as { department?: string } | undefined)
    ?.department;
  const wizardInitialData: LoadedDraft | undefined =
    initialData ?? (sessionDepartment ? { department: sessionDepartment } : undefined);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/suggestions"
            className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-slate-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight font-display">
              Buat Suggestion
            </h1>
            <p className="text-gray-500 text-sm">
              Sampaikan ide perbaikanmu untuk perusahaan.
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      )}

      {loadingDraft || sessionStatus === "loading" ? (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-500">
          Memuat draft...
        </div>
      ) : (
        <SuggestionWizard
          mode="create"
          initialData={wizardInitialData}
          draftId={draftId}
          departments={departments}
          onSaveDraft={handleSaveDraft}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

export default function CreateSuggestionPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center text-sm text-gray-500">
            Memuat...
          </div>
        </div>
      }
    >
      <CreateSuggestionWizardPage />
    </Suspense>
  );
}
