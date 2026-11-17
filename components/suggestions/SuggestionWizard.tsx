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
  Info,
  Lightbulb,
  Wallet,
} from "lucide-react";

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
  // which `isStepComplete` handles separately (not a plain emptiness check).
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
    // STEP 2 (Task 8): require problem/solution >= 50 chars.
    // STEP 4 (Task 9): photos stay optional.
    // STEP 5 (Task 10): final submit, no "Lanjut".
    default:
      return true;
  }
}

type QuotaInfo = { used: number; max: number };

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
  const { initialData, departments } = props;

  const [currentStep, setCurrentStep] = useState(FIRST_STEP);
  const [formData, setFormData] = useState<SuggestionFormData>(() =>
    createFormData(initialData)
  );
  const [touched, setTouched] = useState<
    Partial<Record<keyof SuggestionFormData, boolean>>
  >({});
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

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

  /** Placeholder for the steps that later tasks fill in. */
  const renderPlaceholder = (label: string, note: string) => (
    <div className="space-y-5">
      <h3 className="text-lg font-bold text-slate-800 border-b border-gray-100 pb-2">
        {label}
      </h3>
      <p className="text-sm text-gray-500">{note}</p>
    </div>
  );

  const renderStepContent = () => {
    switch (renderedStep) {
      case 1:
        return renderStep1();
      case 2:
        // STEP 2 (Task 8): guided Problem/Solution textareas + voice input.
        return renderPlaceholder("Problem & Solusi", "Langkah ini belum tersedia.");
      case 3:
        return renderStep3();
      case 4:
        // STEP 4 (Task 9): Before/After + up to 3 supporting photos.
        return renderPlaceholder("Foto", "Langkah ini belum tersedia.");
      case 5:
        // STEP 5 (Task 10): review summary, duplicate check, final submit.
        return renderPlaceholder("Review", "Langkah ini belum tersedia.");
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
          disabled={currentStep === FIRST_STEP}
          className="w-full md:w-auto px-6 py-3 bg-white border border-gray-200 text-slate-600 font-bold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </button>

        {currentStep < LAST_STEP && (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="w-full md:w-auto px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
          >
            Lanjut
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
