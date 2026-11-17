"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Image as ImageIcon,
  Info,
  Lightbulb,
  Plus,
  Send,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import VoiceInputButton from "./VoiceInputButton";
import { compressImageFile } from "@/lib/compressImage";

/* ============================================================================
 * Public contract (imported by the create page, the edit page and the later
 * wizard steps — keep these stable).
 * ========================================================================== */

export type SuggestionFormData = {
  title: string;
  category: string;
  department: string;
  problem: string;
  solution: string;
  costEffectiveExplanation: string;
  costEffectiveNominal: string;
  beforeImage: File | null;
  afterImage: File | null;
  additionalImages: File[];
};

export type SuggestionWizardProps = {
  mode: "create" | "revise";
  initialData?: Partial<SuggestionFormData>; // existing draft or revision being edited
  draftId?: string; // present when resuming/finalizing a draft
  departments: { _id: string; name: string }[];
  onSaveDraft: (data: SuggestionFormData) => Promise<{ _id: string }>;
  onSubmit: (data: SuggestionFormData) => Promise<void>;
};

/* ============================================================================
 * HOW TO FILL IN A STEP
 * ---------------------------------------------------------------------------
 * The wizard keeps ONE `formData` object plus `currentStep` (1-5). To fill in
 * a step you only need to touch three places, all marked with a `STEP <n>`
 * comment below:
 *
 *   1. `STEPS`            — the step's icon + label (already defined for 1-5).
 *   2. `isStepComplete()` — the rule that enables the "Lanjut" button for that
 *                           step. Steps with no required fields return `true`.
 *   3. `renderStepContent()` — replace the `case <n>` placeholder with the
 *                           step's JSX. Read values from `formData`, write with
 *                           `setField("fieldName", value)`. Use `fieldError()`
 *                           + `markTouched()` for on-blur validation and
 *                           `INPUT_CLASS` for the shared input chrome so every
 *                           step looks identical.
 *
 * Animation policy: the step-to-step transition below is the ONE orchestrated
 * animation in this flow. Do not add hover/entrance animations elsewhere.
 *
 * IMPORTANT: Step content fully unmounts/remounts on each navigation. See the
 * unmount-consequence note near `visibleStep` before adding step-local state.
 * ========================================================================== */

type StepDefinition = {
  id: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STEPS: StepDefinition[] = [
  { id: 1, label: "Info Dasar", icon: ClipboardList },
  { id: 2, label: "Problem & Solusi", icon: Lightbulb },
  { id: 3, label: "Dampak Biaya", icon: Wallet },
  { id: 4, label: "Foto", icon: Camera },
  { id: 5, label: "Review", icon: ClipboardCheck },
];

const FIRST_STEP = 1;
const LAST_STEP = STEPS.length;

/** Duration of the step transition, in ms. Keep in sync with `duration-200`. */
const TRANSITION_MS = 200;

const CATEGORY_OPTIONS = [
  "Safety / 5S / Lingkungan",
  "Quality / Product Improvement",
  "Cost Down / Efisiensi Biaya Operasional",
];

/** STEP 2 (Task 8): minimum length required for both `problem` and `solution`. */
const MIN_PROBLEM_SOLUTION_LENGTH = 50;

/**
 * STEP 4 (Task 9): client-side mirror of `MAX_IMAGE_SIZE` in
 * `lib/suggestionUploads.ts` — rejecting an over-limit file here means a
 * legitimate upload never gets a surprise 400 at submit time.
 */
const MAX_CLIENT_IMAGE_SIZE = 5 * 1024 * 1024;

/** STEP 4 (Task 9): the maximum number of "Foto Pendukung" (supporting) photos. */
const MAX_ADDITIONAL_IMAGES = 3;

/** Shared input chrome — identical to the rest of the dashboard's forms. */
const INPUT_CLASS =
  "w-full px-4 py-3 bg-gray-50 border rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";

const EMPTY_FORM_DATA: SuggestionFormData = {
  title: "",
  category: "",
  department: "",
  problem: "",
  solution: "",
  costEffectiveExplanation: "",
  costEffectiveNominal: "",
  beforeImage: null,
  afterImage: null,
  additionalImages: [],
};

/** Field-by-field merge so a partial `initialData` can never inject `undefined`. */
function createFormData(initial?: Partial<SuggestionFormData>): SuggestionFormData {
  return {
    title: initial?.title ?? EMPTY_FORM_DATA.title,
    category: initial?.category ?? EMPTY_FORM_DATA.category,
    department: initial?.department ?? EMPTY_FORM_DATA.department,
    problem: initial?.problem ?? EMPTY_FORM_DATA.problem,
    solution: initial?.solution ?? EMPTY_FORM_DATA.solution,
    costEffectiveExplanation:
      initial?.costEffectiveExplanation ?? EMPTY_FORM_DATA.costEffectiveExplanation,
    costEffectiveNominal:
      initial?.costEffectiveNominal ?? EMPTY_FORM_DATA.costEffectiveNominal,
    beforeImage: initial?.beforeImage ?? EMPTY_FORM_DATA.beforeImage,
    afterImage: initial?.afterImage ?? EMPTY_FORM_DATA.afterImage,
    additionalImages: initial?.additionalImages ?? EMPTY_FORM_DATA.additionalImages,
  };
}

/** Required fields per step, used for on-blur validation + the "Lanjut" gate. */
const REQUIRED_FIELDS: Partial<Record<number, (keyof SuggestionFormData)[]>> = {
  1: ["title", "category", "department"],
  // STEP 2 (Task 8): problem/solution are required with a 50-character minimum,
  // which `isStepComplete` handles separately (not a plain emptiness check) —
  // listed here too so `handleNext` still marks them touched when blocked.
  2: ["problem", "solution"],
};

/**
 * Can the user leave `step`? Extend here when a step gains required fields.
 */
function isStepComplete(step: number, data: SuggestionFormData): boolean {
  switch (step) {
    case 1:
      return (REQUIRED_FIELDS[1] ?? []).every(
        (field) => String(data[field] ?? "").trim().length > 0
      );
    case 2:
      return (
        data.problem.trim().length >= MIN_PROBLEM_SOLUTION_LENGTH &&
        data.solution.trim().length >= MIN_PROBLEM_SOLUTION_LENGTH
      );
    // STEP 4 (Task 9): photos stay optional.
    // STEP 5 (Task 10): final submit, no "Lanjut".
    default:
      return true;
  }
}

/**
 * STEP 5 (Task 10): `props.onSubmit`'s rejection value isn't necessarily an
 * `Error` — the page-level wrapper (Tasks 12/13) may reject with a plain
 * `{ message: string }` (e.g. a quota-reached response body). Handle both
 * shapes so the review step always has something readable to show, without
 * ever throwing while rendering the error itself.
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message;
  }
  return fallback;
}

type QuotaInfo = { used: number; max: number };

/** STEP 5 (Task 10): one match returned by `POST /api/suggestions/similar`. */
type SimilarMatch = { _id: string; title: string; score: number };

/**
 * STEP 5 (Task 10): the duplicate-idea check's result for the current visit
 * to Step 5. Transient per-visit UI state — see the `similarCheck` state
 * declaration below for why it's still declared at the component's top
 * level rather than inside `renderStep5`.
 */
type SimilarCheckState = {
  status: "idle" | "loading" | "done" | "error";
  matches: SimilarMatch[];
  dismissed: boolean;
};

/** STEP 4 (Task 9): the three photo drop targets — "additional" is the single
 * in-progress "+ Tambah Foto" slot, not one slot per already-added photo. */
type PhotoSlot = "before" | "after" | "additional";

type TransitionPhase = "idle" | "exiting" | "entering";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * `prefers-reduced-motion: reduce`. The CSS side is handled by Tailwind's
 * `motion-reduce:` variants; this hook additionally lets the JS skip the
 * two-phase step transition entirely (otherwise the outgoing content would sit
 * invisible for the transition's duration with no animation to fill it).
 */
function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

export default function SuggestionWizard(props: SuggestionWizardProps) {
  const { initialData, departments, draftId, onSubmit } = props;

  const [currentStep, setCurrentStep] = useState(FIRST_STEP);
  const [formData, setFormData] = useState<SuggestionFormData>(() =>
    createFormData(initialData)
  );
  const [touched, setTouched] = useState<
    Partial<Record<keyof SuggestionFormData, boolean>>
  >({});
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  // STEP 5 (Task 10): the duplicate-check result and the final-submit
  // in-flight/error state. Both are transient, per-visit UI state — neither
  // needs to survive navigation in `formData` — but they're declared here,
  // at the component's top level, because the effect that fires the
  // duplicate check (below) must run unconditionally on every render per the
  // rules of hooks, not only while Step 5 happens to be mounted.
  const [similarCheck, setSimilarCheck] = useState<SimilarCheckState>({
    status: "idle",
    matches: [],
    dismissed: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // STEP 4 (Task 9): transient, tile-local UI state for the photo step. None
  // of this needs to survive navigation (it's derived fresh from whatever
  // the user is doing right now), but it's declared here — at the top level
  // of the wizard, not inside a `render*` function — because the photo
  // previews below use effects, and those must be called unconditionally on
  // every render (rules of hooks), not only while step 4 happens to be
  // mounted.
  const [photoStatus, setPhotoStatus] = useState<
    Record<PhotoSlot, { compressing: boolean; error: string | null }>
  >({
    before: { compressing: false, error: null },
    after: { compressing: false, error: null },
    additional: { compressing: false, error: null },
  });
  const [dragOverSlot, setDragOverSlot] = useState<PhotoSlot | null>(null);

  const prefersReducedMotion = usePrefersReducedMotion();

  /* --- step transition (the one orchestrated animation) -------------------- */
  // `visibleStep` is the step actually mounted; it lags `currentStep` by one
  // exit animation so the outgoing content can animate out before unmounting.
  // Consequence: step content fully unmounts/remounts on every step change — don't
  // put anything that must survive navigation in step-local state; use `formData`
  // (or lift state here) instead.
  const [visibleStep, setVisibleStep] = useState(FIRST_STEP);
  const [entering, setEntering] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);

  // "exiting" is derived, not stored: whenever the target step is ahead of the
  // mounted one, the mounted one is on its way out.
  const phase: TransitionPhase = prefersReducedMotion
    ? "idle"
    : currentStep !== visibleStep
    ? "exiting"
    : entering
    ? "entering"
    : "idle";

  // Swap in the new step once the outgoing one has finished animating out.
  // With reduced motion the rendered step is derived straight from
  // `currentStep` (see `renderedStep`), so this effect has nothing to do.
  useEffect(() => {
    if (prefersReducedMotion || currentStep === visibleStep) return;
    const timer = window.setTimeout(() => {
      setVisibleStep(currentStep);
      setEntering(true);
    }, TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [currentStep, visibleStep, prefersReducedMotion]);

  // Two frames: let the browser paint the offset start state, then settle.
  useEffect(() => {
    if (!entering) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setEntering(false));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [entering]);

  /** The step actually mounted right now. */
  const renderedStep = prefersReducedMotion ? currentStep : visibleStep;

  const transitionClass = useMemo(() => {
    if (prefersReducedMotion || phase === "idle") return "translate-x-0 opacity-100";
    const forward = direction === 1;
    if (phase === "exiting") {
      return forward ? "-translate-x-3 opacity-0" : "translate-x-3 opacity-0";
    }
    return forward ? "translate-x-3 opacity-0" : "-translate-x-3 opacity-0";
  }, [phase, direction, prefersReducedMotion]);

  /* --- quota banner -------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/suggestions/quota")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.used === "number" && typeof data.max === "number") {
          setQuota({ used: data.used, max: data.max });
        }
      })
      .catch(() => {
        // Advisory only — a failed quota lookup must never block the wizard.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* --- STEP 5 (Task 10): duplicate-idea check ------------------------------
   * Fires the first time `currentStep` reaches 5, and again any time it
   * reaches 5 after the user went back and changed title/problem/department
   * (and cleared on every re-fire, so a dismissed warning from a previous
   * visit never carries over). `formData.title/problem/department` and
   * `draftId` are listed as dependencies alongside `currentStep` only so a
   * change to them is "seen" by this effect the next time it matters — since
   * Step 5 has no editable fields, they can only change while `currentStep`
   * is NOT 5, in which case the guard below returns before fetching anything.
   */
  useEffect(() => {
    if (currentStep !== LAST_STEP) return;
    let cancelled = false;
    // No synchronous `setSimilarCheck(...)` call here (even to flip a
    // "loading" flag) — only inside the `.then`/`.catch` callbacks below —
    // so this stays a "subscribe to an external result" effect rather than
    // the "setState synchronously within an effect" anti-pattern ESLint's
    // `react-hooks/set-state-in-effect` flags.
    fetch("/api/suggestions/similar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formData.title,
        problem: formData.problem,
        department: formData.department,
        ...(draftId ? { excludeId: draftId } : {}),
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => {
        if (cancelled) return;
        setSimilarCheck({
          status: "done",
          matches: Array.isArray(data?.matches) ? data.matches : [],
          dismissed: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Advisory only — a failed duplicate check must never block the wizard.
        setSimilarCheck({ status: "error", matches: [], dismissed: false });
      });
    return () => {
      cancelled = true;
    };
  }, [currentStep, formData.title, formData.problem, formData.department, draftId]);

  /* --- form helpers -------------------------------------------------------- */
  const setField = useCallback(
    <K extends keyof SuggestionFormData>(key: K, value: SuggestionFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const markTouched = useCallback((key: keyof SuggestionFormData) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }, []);

  /**
   * Error message for a required field the user has already left (blurred)
   * while empty. Call it only for fields that really are required — it does
   * not consult `REQUIRED_FIELDS` itself, so it stays independent of which
   * step is mid-transition.
   */
  const fieldError = useCallback(
    (key: keyof SuggestionFormData, message: string) => {
      if (!touched[key]) return null;
      return String(formData[key] ?? "").trim().length === 0 ? message : null;
    },
    [touched, formData]
  );

  const isFilled = (key: keyof SuggestionFormData) =>
    String(formData[key] ?? "").trim().length > 0;

  /* --- STEP 4 (Task 9): photo previews -------------------------------------
   * The object URL is derived synchronously during render via `useMemo` (a
   * pure function of the `File`) rather than via effect+state — computing it
   * eagerly means the preview is available the same render the file lands in
   * `formData`, and avoids the "setState inside an effect" anti-pattern.
   * `URL.createObjectURL` results must still be revoked or they leak for the
   * life of the tab, so a cleanup-only effect (no setState) revokes the
   * previous URL whenever it changes or on unmount. Declared here — not
   * inside `renderStep4` — because these must run unconditionally on every
   * render of the wizard (rules of hooks), not only while step 4 is mounted. */
  const beforeImagePreview = useMemo(
    () => (formData.beforeImage ? URL.createObjectURL(formData.beforeImage) : null),
    [formData.beforeImage]
  );
  useEffect(() => {
    return () => {
      if (beforeImagePreview) URL.revokeObjectURL(beforeImagePreview);
    };
  }, [beforeImagePreview]);

  const afterImagePreview = useMemo(
    () => (formData.afterImage ? URL.createObjectURL(formData.afterImage) : null),
    [formData.afterImage]
  );
  useEffect(() => {
    return () => {
      if (afterImagePreview) URL.revokeObjectURL(afterImagePreview);
    };
  }, [afterImagePreview]);

  const additionalImagePreviews = useMemo(
    () => formData.additionalImages.map((file) => URL.createObjectURL(file)),
    [formData.additionalImages]
  );
  useEffect(() => {
    return () => {
      additionalImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [additionalImagePreviews]);

  /* --- STEP 4 (Task 9): photo selection handlers ---------------------------
   * Every selected file — before/after/additional alike — is run through
   * `compressImageFile` before it's ever written to `formData`, so what
   * lands in state (and what later gets uploaded) is always the compressed
   * version. A tile's "Mengompres..." / error state lives in `photoStatus`
   * (declared above, not here) since it must stay in sync while this async
   * work is in flight, independent of whichever render function is active.
   */
  const setPhotoSlotStatus = useCallback(
    (slot: PhotoSlot, status: { compressing: boolean; error: string | null }) => {
      setPhotoStatus((prev) => ({ ...prev, [slot]: status }));
    },
    []
  );

  const handleBeforeAfterFile = useCallback(
    async (slot: "before" | "after", file: File) => {
      setPhotoSlotStatus(slot, { compressing: true, error: null });
      try {
        const compressed = await compressImageFile(file);
        if (compressed.size > MAX_CLIENT_IMAGE_SIZE) {
          setPhotoSlotStatus(slot, {
            compressing: false,
            error: "Masih terlalu besar setelah dikompres.",
          });
          return;
        }
        setPhotoSlotStatus(slot, { compressing: false, error: null });
        setField(slot === "before" ? "beforeImage" : "afterImage", compressed);
      } catch {
        setPhotoSlotStatus(slot, {
          compressing: false,
          error: "File harus berupa gambar.",
        });
      }
    },
    [setField, setPhotoSlotStatus]
  );

  const removeBeforeAfterImage = useCallback(
    (slot: "before" | "after") => {
      setField(slot === "before" ? "beforeImage" : "afterImage", null);
      setPhotoSlotStatus(slot, { compressing: false, error: null });
    },
    [setField, setPhotoSlotStatus]
  );

  const handleAdditionalFile = useCallback(
    async (file: File) => {
      setPhotoSlotStatus("additional", { compressing: true, error: null });
      try {
        const compressed = await compressImageFile(file);
        if (compressed.size > MAX_CLIENT_IMAGE_SIZE) {
          setPhotoSlotStatus("additional", {
            compressing: false,
            error: "Masih terlalu besar setelah dikompres.",
          });
          return;
        }
        setPhotoSlotStatus("additional", { compressing: false, error: null });
        setFormData((prev) => ({
          ...prev,
          additionalImages: [...prev.additionalImages, compressed],
        }));
      } catch {
        setPhotoSlotStatus("additional", {
          compressing: false,
          error: "File harus berupa gambar.",
        });
      }
    },
    [setPhotoSlotStatus]
  );

  const removeAdditionalImage = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      additionalImages: prev.additionalImages.filter((_, i) => i !== index),
    }));
  }, []);

  /* --- navigation ---------------------------------------------------------- */
  const goToStep = useCallback(
    (step: number) => {
      if (step < FIRST_STEP || step > LAST_STEP || step === currentStep) return;
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
    },
    [currentStep]
  );

  const handleNext = () => {
    if (!isStepComplete(currentStep, formData)) {
      // Surface what's missing instead of silently doing nothing.
      setTouched((prev) => {
        const next = { ...prev };
        for (const field of REQUIRED_FIELDS[currentStep] ?? []) next[field] = true;
        return next;
      });
      return;
    }
    goToStep(currentStep + 1);
  };

  const canGoNext = isStepComplete(currentStep, formData);

  // STEP 5 (Task 10): final submit. `formData` is untouched on rejection —
  // only `submitError` is set — so the user never loses what they entered.
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(formData);
    } catch (err) {
      setSubmitError(
        extractErrorMessage(err, "Gagal mengirim usulan. Silakan coba lagi.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* --- step content -------------------------------------------------------- */

  const renderQuotaBanner = () => {
    if (!quota) return null;
    const atCap = quota.used >= quota.max;

    if (atCap) {
      return (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
          <div className="mt-0.5 text-amber-600 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-amber-900 text-sm">
              Kuota bulan ini sudah terpakai habis
            </h3>
            <p className="text-amber-700/90 text-sm mt-1">
              Kamu sudah pakai {quota.used}/{quota.max} usulan bulan ini. Kamu masih bisa
              menyusun dan menyimpan usulan ini sebagai draft.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
        <div className="mt-0.5 text-blue-600 shrink-0">
          <Info className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-blue-900 text-sm">Kuota Usulan</h3>
          <p className="text-blue-700/80 text-sm mt-1">
            Kamu sudah pakai {quota.used}/{quota.max} usulan bulan ini.
          </p>
        </div>
      </div>
    );
  };

  // STEP 1 — Info Dasar
  const renderStep1 = () => {
    const titleError = fieldError("title", "Judul ide wajib diisi.");
    const categoryError = fieldError("category", "Pilih salah satu kategori.");
    const departmentError = fieldError("department", "Pilih departemen tujuan.");

    return (
      <div className="space-y-6">
        {renderQuotaBanner()}

        <div className="space-y-5">
          <h3 className="text-lg font-bold text-slate-800 border-b border-gray-100 pb-2">
            Informasi Dasar
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="wizard-title" className="text-sm font-bold text-slate-700 block">
                Judul Ide <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="wizard-title"
                  type="text"
                  placeholder="Contoh: Penggantian Lampu Gudang ke LED"
                  className={`${INPUT_CLASS} pr-11 ${
                    titleError ? "border-red-300" : "border-gray-200"
                  }`}
                  value={formData.title}
                  onChange={(e) => setField("title", e.target.value)}
                  onBlur={() => markTouched("title")}
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? "wizard-title-error" : undefined}
                />
                {isFilled("title") && !titleError && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
              </div>
              {titleError && (
                <p id="wizard-title-error" className="text-xs text-red-500 font-medium">
                  {titleError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="wizard-category"
                className="text-sm font-bold text-slate-700 block"
              >
                Kategori <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  id="wizard-category"
                  className={`${INPUT_CLASS} appearance-none pr-11 ${
                    categoryError ? "border-red-300" : "border-gray-200"
                  }`}
                  value={formData.category}
                  onChange={(e) => setField("category", e.target.value)}
                  onBlur={() => markTouched("category")}
                  aria-invalid={categoryError ? true : undefined}
                  aria-describedby={categoryError ? "wizard-category-error" : undefined}
                >
                  <option value="" disabled>
                    Pilih Kategori...
                  </option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {isFilled("category") && !categoryError && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
              </div>
              {categoryError && (
                <p id="wizard-category-error" className="text-xs text-red-500 font-medium">
                  {categoryError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="wizard-department"
                className="text-sm font-bold text-slate-700 block"
              >
                Departemen Tujuan <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  id="wizard-department"
                  className={`${INPUT_CLASS} appearance-none pr-11 ${
                    departmentError ? "border-red-300" : "border-gray-200"
                  }`}
                  value={formData.department}
                  onChange={(e) => setField("department", e.target.value)}
                  onBlur={() => markTouched("department")}
                  aria-invalid={departmentError ? true : undefined}
                  aria-describedby={departmentError ? "wizard-department-error" : undefined}
                >
                  <option value="" disabled>
                    Pilih Departemen...
                  </option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {isFilled("department") && !departmentError && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
              </div>
              {departmentError && (
                <p
                  id="wizard-department-error"
                  className="text-xs text-red-500 font-medium"
                >
                  {departmentError}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // STEP 2 — Problem & Solusi
  const renderStep2 = () => {
    const problemLength = formData.problem.trim().length;
    const solutionLength = formData.solution.trim().length;

    // Appends recognized speech to whatever is already in the field, using a
    // functional `setFormData` update so it's always based on the latest
    // value even if voice results arrive in quick succession.
    const appendVoiceResult = (key: "problem" | "solution", text: string) => {
      const heard = text.trim();
      if (!heard) return;
      setFormData((prev) => ({
        ...prev,
        [key]: prev[key] ? `${prev[key]} ${heard}` : heard,
      }));
    };

    return (
      <div className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b border-gray-100 pb-2">
          Problem & Solusi
        </h3>

        <div className="space-y-1.5">
          <label htmlFor="wizard-problem" className="text-sm font-bold text-slate-700 block">
            Masalah <span className="text-red-500">*</span>
          </label>
          <p className="text-sm text-gray-500">
            Apa masalahnya? Kapan terjadi? Siapa/apa yang terdampak?
          </p>
          <div className="relative">
            <textarea
              id="wizard-problem"
              rows={5}
              placeholder="Ceritakan masalah yang kamu temukan..."
              className={`${INPUT_CLASS} border-gray-200 resize-none pr-12`}
              value={formData.problem}
              onChange={(e) => setField("problem", e.target.value)}
              onBlur={() => markTouched("problem")}
              aria-describedby="wizard-problem-counter"
            />
            <div className="absolute top-2.5 right-2.5">
              <VoiceInputButton onResult={(text) => appendVoiceResult("problem", text)} />
            </div>
          </div>
          {problemLength < MIN_PROBLEM_SOLUTION_LENGTH && (
            <p id="wizard-problem-counter" className="text-xs text-gray-400 font-medium">
              {problemLength}/{MIN_PROBLEM_SOLUTION_LENGTH} karakter
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="wizard-solution" className="text-sm font-bold text-slate-700 block">
            Usulan Solusi <span className="text-red-500">*</span>
          </label>
          <p className="text-sm text-gray-500">
            Apa yang kamu usulkan? Apa dampaknya kalau dijalankan?
          </p>
          <div className="relative">
            <textarea
              id="wizard-solution"
              rows={5}
              placeholder="Ceritakan solusi yang kamu usulkan..."
              className={`${INPUT_CLASS} border-gray-200 resize-none pr-12`}
              value={formData.solution}
              onChange={(e) => setField("solution", e.target.value)}
              onBlur={() => markTouched("solution")}
              aria-describedby="wizard-solution-counter"
            />
            <div className="absolute top-2.5 right-2.5">
              <VoiceInputButton onResult={(text) => appendVoiceResult("solution", text)} />
            </div>
          </div>
          {solutionLength < MIN_PROBLEM_SOLUTION_LENGTH && (
            <p id="wizard-solution-counter" className="text-xs text-gray-400 font-medium">
              {solutionLength}/{MIN_PROBLEM_SOLUTION_LENGTH} karakter
            </p>
          )}
        </div>
      </div>
    );
  };

  // STEP 3 — Dampak Biaya (both fields optional, unchanged from today's form)
  const renderStep3 = () => (
    <div className="space-y-5">
      <h3 className="text-lg font-bold text-slate-800 border-b border-gray-100 pb-2">
        Dampak Biaya
      </h3>

      <div className="space-y-6">
        <div className="space-y-1.5">
          <label
            htmlFor="wizard-cost-explanation"
            className="text-sm font-bold text-slate-700 block"
          >
            Alasan Hemat Biaya (Cost Effective){" "}
            <span className="text-gray-400 font-normal text-xs">(Opsional)</span>
          </label>
          <textarea
            id="wizard-cost-explanation"
            rows={3}
            placeholder="Mengapa usulan ini menghemat biaya?"
            className={`${INPUT_CLASS} border-gray-200 resize-none`}
            value={formData.costEffectiveExplanation}
            onChange={(e) => setField("costEffectiveExplanation", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="wizard-cost-nominal"
            className="text-sm font-bold text-slate-700 block"
          >
            Estimasi Penghematan (Rp){" "}
            <span className="text-gray-400 font-normal text-xs">(Opsional)</span>
          </label>
          <input
            id="wizard-cost-nominal"
            type="number"
            placeholder="Contoh: 500000"
            className={`${INPUT_CLASS} border-gray-200`}
            value={formData.costEffectiveNominal}
            onChange={(e) => setField("costEffectiveNominal", e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  // STEP 4 (Task 9): Before/After + up to 3 supporting photos.
  const renderStep4 = () => {
    // A single before/after drop tile. The dashed box is always the <label>
    // (clicking anywhere opens the picker to pick/replace the photo, matching
    // today's create-page tiles), whether or not a file is already stored.
    // Once a file is stored, a standalone remove (X) button sits on top of the
    // tile; its onClick stops propagation (and prevents default) so clicking
    // it removes the photo without also bubbling the click to the label and
    // reopening the file picker.
    const renderBeforeAfterTile = (
      slot: "before" | "after",
      label: string,
      helperText: string,
      file: File | null,
      previewUrl: string | null
    ) => {
      const status = photoStatus[slot];
      const isDragActive = dragOverSlot === slot;
      const boxClassName = `relative border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all min-h-[160px] ${
        isDragActive
          ? "border-primary bg-primary/5"
          : status.error
          ? "border-red-300 bg-red-50"
          : "border-gray-200 bg-gray-50"
      }`;

      const dragHandlers = {
        onDragEnter: (e: React.DragEvent) => {
          e.preventDefault();
          setDragOverSlot(slot);
        },
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          setDragOverSlot(slot);
        },
        onDragLeave: (e: React.DragEvent) => {
          e.preventDefault();
          setDragOverSlot((prev) => (prev === slot ? null : prev));
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setDragOverSlot(null);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) handleBeforeAfterFile(slot, dropped);
        },
      };

      return (
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700 block">{label}</label>

          {file && previewUrl ? (
            <label className={`cursor-pointer ${boxClassName}`} {...dragHandlers}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={`Pratinjau ${label}`}
                className="w-full h-24 object-cover rounded-xl mb-2"
              />
              <p className="text-xs text-gray-500 truncate max-w-full">{file.name}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeBeforeAfterImage(slot);
                }}
                aria-label={`Hapus ${label}`}
                className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                disabled={status.compressing}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  e.target.value = "";
                  if (selected) handleBeforeAfterFile(slot, selected);
                }}
              />
            </label>
          ) : (
            <label className={`cursor-pointer ${boxClassName}`} {...dragHandlers}>
              <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-gray-400 mb-3">
                {status.compressing ? (
                  <Camera className="w-6 h-6 text-primary animate-pulse motion-reduce:animate-none" />
                ) : (
                  <ImageIcon className="w-6 h-6" />
                )}
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">
                {status.compressing ? "Mengompres..." : "Ambil / Pilih Foto"}
              </p>
              {!status.compressing && <p className="text-xs text-gray-500">{helperText}</p>}
              <input
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                disabled={status.compressing}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  e.target.value = "";
                  if (selected) handleBeforeAfterFile(slot, selected);
                }}
              />
            </label>
          )}

          {status.error && (
            <p className="text-xs text-red-500 font-medium">{status.error}</p>
          )}
        </div>
      );
    };

    const additionalStatus = photoStatus.additional;
    const additionalCount = formData.additionalImages.length;
    const canAddMore = additionalCount < MAX_ADDITIONAL_IMAGES;
    const isAdditionalDragActive = dragOverSlot === "additional";

    return (
      <div className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b border-gray-100 pb-2">
          Foto
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderBeforeAfterTile(
            "before",
            "Foto Kondisi Awal (Before)",
            "PNG, JPG, JPEG (Max. 5MB)",
            formData.beforeImage,
            beforeImagePreview
          )}
          {renderBeforeAfterTile(
            "after",
            "Foto Sesudah Perbaikan (After)",
            "Bisa di-upload menyusul (Opsional)",
            formData.afterImage,
            afterImagePreview
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700 block">
            Foto Pendukung{" "}
            <span className="text-gray-400 font-normal text-xs">
              (Opsional, maks. {MAX_ADDITIONAL_IMAGES})
            </span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {formData.additionalImages.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={additionalImagePreviews[index]}
                  alt={`Foto pendukung ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAdditionalImage(index)}
                  aria-label={`Hapus foto pendukung ${index + 1}`}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center text-gray-500 hover:text-red-500 hover:border-red-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {canAddMore && (
              <label
                className={`cursor-pointer aspect-square border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-all p-2 ${
                  isAdditionalDragActive
                    ? "border-primary bg-primary/5"
                    : additionalStatus.error
                    ? "border-red-300 bg-red-50"
                    : "border-gray-200 bg-gray-50"
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverSlot("additional");
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverSlot("additional");
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOverSlot((prev) => (prev === "additional" ? null : prev));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverSlot(null);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) handleAdditionalFile(dropped);
                }}
              >
                {additionalStatus.compressing ? (
                  <>
                    <Camera className="w-5 h-5 text-primary mb-1 animate-pulse motion-reduce:animate-none" />
                    <span className="text-[11px] font-bold text-slate-700">
                      Mengompres...
                    </span>
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-gray-400 mb-1" />
                    <span className="text-[11px] font-bold text-slate-700">
                      Tambah Foto
                    </span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  disabled={additionalStatus.compressing}
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    e.target.value = "";
                    if (selected) handleAdditionalFile(selected);
                  }}
                />
              </label>
            )}
          </div>

          {additionalStatus.error && (
            <p className="text-xs text-red-500 font-medium">{additionalStatus.error}</p>
          )}
        </div>
      </div>
    );
  };

  // STEP 5 (Task 10): read-only review of every field from Steps 1-4, plus
  // the non-blocking duplicate-idea warning. Visually mirrors
  // `suggestions/[id]/page.tsx`'s problem/solution/cost-effective card
  // sections (red-50/emerald-50/blue-50 bodies) so what's previewed here
  // matches what's shown after submission. Final submit itself lives in the
  // shared footer below (it needs to replace "Lanjut", which is rendered
  // outside any `render*` function), not here.
  const renderStep5 = () => {
    const departmentName =
      departments.find((d) => d._id === formData.department)?.name || "-";
    const nominalValue = Number(formData.costEffectiveNominal) || 0;
    const hasCostInfo =
      formData.costEffectiveExplanation.trim().length > 0 || nominalValue > 0;

    return (
      <div className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b border-gray-100 pb-2">
          Review Usulan
        </h3>

        {/* Duplicate-idea warning — dismissible, never blocks submit. */}
        {similarCheck.status === "done" &&
          similarCheck.matches.length > 0 &&
          !similarCheck.dismissed && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
              <div className="mt-0.5 text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-amber-900 text-sm">
                  {similarCheck.matches.length} ide serupa sudah pernah diajukan di
                  departemen ini
                </h4>
                <ul className="mt-2 space-y-1.5">
                  {similarCheck.matches.map((match) => (
                    <li key={match._id} className="min-w-0">
                      <Link
                        href={`/dashboard/suggestions/${match._id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-amber-800 underline decoration-amber-300 hover:text-amber-900 break-words"
                      >
                        {match.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSimilarCheck((prev) => ({ ...prev, dismissed: true }))
                }
                aria-label="Tutup peringatan ide serupa"
                className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

        <div className="bg-white rounded-2xl border border-gray-100 p-5 md:p-6 space-y-6 max-w-4xl">
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">
              Judul Ide
            </p>
            <p className="text-base font-bold text-slate-800 break-words">
              {formData.title || "-"}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">
                Kategori
              </p>
              <p className="text-sm font-bold text-slate-800 break-words">
                {formData.category || "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">
                Departemen Tujuan
              </p>
              <p className="text-sm font-bold text-slate-800 break-words">
                {departmentName}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-800">
              Kondisi Saat Ini (Masalah)
            </h4>
            <div className="p-4 bg-red-50/50 rounded-2xl border border-red-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap break-words">
              {formData.problem || "-"}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold text-slate-800">Solusi yang Diusulkan</h4>
            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap break-words">
              {formData.solution || "-"}
            </div>
          </div>

          {hasCostInfo && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-slate-800">
                Efisiensi Biaya (Cost Effective)
              </h4>
              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {nominalValue > 0 && (
                  <p className="font-bold text-blue-800 mb-2">
                    Estimasi Hemat: Rp {nominalValue.toLocaleString("id-ID")}
                  </p>
                )}
                {formData.costEffectiveExplanation && (
                  <p>{formData.costEffectiveExplanation}</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-800">Dokumentasi Foto</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="inline-block px-2.5 py-1 bg-red-100 text-red-700 text-[11px] font-bold rounded-full">
                  BEFORE
                </span>
                <div className="aspect-video bg-gray-50 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center">
                  {beforeImagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={beforeImagePreview}
                      alt="Pratinjau foto before"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">
                      Tidak ada foto
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-full">
                  AFTER
                </span>
                <div className="aspect-video bg-gray-50 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center">
                  {afterImagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={afterImagePreview}
                      alt="Pratinjau foto after"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">
                      Tidak ada foto
                    </span>
                  )}
                </div>
              </div>
            </div>

            {additionalImagePreviews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {additionalImagePreviews.map((url, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`additional-preview-${index}`}
                    src={url}
                    alt={`Foto pendukung ${index + 1}`}
                    className="aspect-square w-full rounded-xl border border-gray-200 object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    switch (renderedStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      case 5:
        return renderStep5();
      default:
        return null;
    }
  };

  const activeStepLabel = STEPS.find((step) => step.id === currentStep)?.label ?? "";

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Progress indicator */}
      <div className="p-6 md:p-8 border-b border-gray-100">
        <ol className="flex items-start" aria-label="Langkah pengisian usulan">
          {STEPS.map((step, index) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;
            const Icon = step.icon;

            return (
              <li
                key={step.id}
                className={`flex items-start ${
                  index === STEPS.length - 1 ? "" : "flex-1"
                } min-w-0`}
              >
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => goToStep(step.id)}
                    disabled={!isCompleted}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`Langkah ${step.id}: ${step.label}${
                      isCompleted ? " (selesai, klik untuk kembali)" : ""
                    }`}
                    title={step.label}
                    className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center border ${
                      isCurrent
                        ? "bg-primary text-white border-primary ring-4 ring-primary/20 animate-pulse motion-reduce:animate-none"
                        : isCompleted
                        ? "bg-primary/10 text-primary border-primary/20 cursor-pointer hover:bg-primary/20"
                        : "bg-gray-50 text-gray-400 border-gray-200 cursor-default"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4 md:w-5 md:h-5" />
                    ) : (
                      <Icon className="w-4 h-4 md:w-5 md:h-5" />
                    )}
                  </button>
                  <span
                    className={`hidden sm:block text-[11px] leading-tight text-center max-w-[76px] ${
                      isCurrent
                        ? "text-primary font-bold"
                        : isCompleted
                        ? "text-slate-600 font-semibold"
                        : "text-gray-400 font-medium"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>

                {index < STEPS.length - 1 && (
                  <div
                    aria-hidden="true"
                    className={`h-0.5 flex-1 mx-1.5 md:mx-2 rounded-full mt-[18px] md:mt-5 ${
                      isCompleted ? "bg-primary/40" : "bg-gray-200"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Mobile: the per-dot labels are hidden, so name the active step here. */}
        <p className="sm:hidden mt-4 text-sm font-bold text-slate-700">
          Langkah {currentStep} dari {LAST_STEP}
          <span className="text-gray-500 font-medium"> · {activeStepLabel}</span>
        </p>
      </div>

      {/* Active step content — the single orchestrated animation of this flow.
          The clip region is 6px wider than the content on each side so the
          translate never spills into a page-level horizontal scrollbar while
          focus rings still render. */}
      <div className="overflow-hidden -mx-1.5 px-1.5">
        <div
          key={renderedStep}
          className={`p-6 md:p-8 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${transitionClass}`}
        >
          {renderStepContent()}
        </div>
      </div>

      {/* Footer actions.
          Task 10 adds the final "Ajukan Suggestion" button on step 5 and
          Task 11 adds the "Simpan Draft" button here. */}
      <div className="p-6 md:p-8 bg-gray-50 border-t border-gray-100 flex flex-col-reverse md:flex-row items-center justify-between gap-3 md:gap-4">
        <button
          type="button"
          onClick={() => goToStep(currentStep - 1)}
          disabled={currentStep === FIRST_STEP || submitting}
          className="w-full md:w-auto px-6 py-3 bg-white border border-gray-200 text-slate-600 font-bold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </button>

        {currentStep < LAST_STEP ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="w-full md:w-auto px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
          >
            Lanjut
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          // STEP 5 (Task 10): final submit. The duplicate-idea warning above
          // is advisory only — dismissing it, or just ignoring it, never
          // disables this button.
          <div className="w-full md:w-auto flex flex-col items-stretch md:items-end gap-2">
            {submitError && (
              <p className="text-sm text-red-600 font-semibold text-center md:text-right">
                {submitError}
              </p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full md:w-auto px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              {submitting ? "Mengirim..." : "Ajukan Suggestion"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
