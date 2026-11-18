"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  MessageSquare,
  Building2,
  Award,
  Send,
  XCircle,
  AlertCircle,
  Download,
  Info,
  ChevronDown,
  ChevronUp,
  X
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const EMPTY_ASSESSMENT = {
  original: 0,
  hoshinKanri: 0,
  yokoten: 0,
  sqcdmpe: {
    safety: 0,
    quality: 0,
    cost: 0,
    delivery: 0,
    morale: 0,
    productivity: 0,
    environment: 0,
    peopleDevelopment: 0,
  },
  costImpact: 0,
};

export default function SuggestionDetailPage() {
  const params = useParams();
  const suggestionId = params?.id as string;

  const { data: session } = useSession();
  const [suggestion, setSuggestion] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reviewer decision state — approve/reject only happens from this page,
  // never from the approvals table, so a reviewer always sees full context
  // (problem, solution, photos, history) before deciding.
  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [assessmentData, setAssessmentData] = useState(EMPTY_ASSESSMENT);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);

  const fetchSuggestion = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch(`/api/suggestions/${suggestionId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSuggestion(data);
    } catch (err) {
      console.error("Failed to fetch suggestion:", err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [suggestionId]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      const res = await fetch(`/api/suggestions/${suggestionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: commentText }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setSuggestion((prev: any) => ({
          ...prev,
          comments: [...(prev.comments || []), newComment]
        }));
        setCommentText("");
        setTimeout(() => {
          chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    } catch (error) {
      console.error("Failed to post comment:", error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleOpenAssessment = () => {
    setAssessmentData(EMPTY_ASSESSMENT);
    setShowGuidance(false);
    setAssessmentModalOpen(true);
  };

  const handleReject = async () => {
    if (!window.confirm("Tolak suggestion ini? Pengaju akan menerima notifikasi penolakan.")) return;

    setReviewAction("reject");
    try {
      const res = await fetch(`/api/suggestions/${suggestionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Rejected" }),
      });
      if (res.ok) {
        await fetchSuggestion(false);
      } else {
        const data = await res.json();
        alert(data.error || "Gagal menolak suggestion");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan");
    } finally {
      setReviewAction(null);
    }
  };

  const handleSubmitAssessment = async (e: React.FormEvent) => {
    e.preventDefault();

    const { original, hoshinKanri, yokoten, sqcdmpe, costImpact } = assessmentData;
    const totalKolom1 = original + hoshinKanri + yokoten;
    const totalSQCDMPE = Object.values(sqcdmpe).reduce((a, b) => a + b, 0);

    if (original > 25) {
      alert("Nilai Original maksimal 25.");
      return;
    }
    if (hoshinKanri > 20) {
      alert("Nilai Hoshin Kanri maksimal 20.");
      return;
    }
    if (yokoten > 15) {
      alert("Nilai Yokoten maksimal 15.");
      return;
    }
    if (totalKolom1 > 60) {
      alert("Total Kolom Penilaian #1 tidak boleh melebihi 60 poin.");
      return;
    }
    if (totalSQCDMPE > 40) {
      alert("Total Dampak Improvement (SQCDMPE+P) tidak boleh melebihi 40 poin.");
      return;
    }

    setReviewAction("approve");
    try {
      const res = await fetch(`/api/suggestions/${suggestionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Approved",
          assessment: { original, hoshinKanri, yokoten, sqcdmpe },
          costImpact,
        }),
      });
      if (res.ok) {
        setAssessmentModalOpen(false);
        await fetchSuggestion(false);
      } else {
        const data = await res.json();
        alert(data.error || "Gagal menyetujui suggestion");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan");
    } finally {
      setReviewAction(null);
    }
  };

  useEffect(() => {
    if (!suggestionId) return;

    fetchSuggestion(true);

    // Polling every 3 seconds for realtime updates
    const intervalId = setInterval(() => {
      fetchSuggestion(false);
    }, 3000);

    return () => clearInterval(intervalId);
  }, [suggestionId, fetchSuggestion]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto flex justify-center items-center h-64">
        <p className="text-gray-500 font-medium animate-pulse">Loading detail...</p>
      </div>
    );
  }

  if (!suggestion || suggestion.error) {
    return (
      <div className="max-w-7xl mx-auto flex flex-col justify-center items-center h-64 space-y-4">
        <p className="text-red-500 font-medium">Suggestion not found or an error occurred.</p>
        <Link href="/dashboard/suggestions" className="text-blue-500 underline">Back to Suggestions</Link>
      </div>
    );
  }

  const statusConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
    Pending: { color: "text-amber-700", bg: "bg-amber-100", icon: Clock, label: "Menunggu Review" },
    Approved: { color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle, label: "Disetujui" },
    Rejected: { color: "text-red-700", bg: "bg-red-100", icon: XCircle, label: "Ditolak" },
    Revision: { color: "text-blue-700", bg: "bg-blue-100", icon: AlertCircle, label: "Revisi" }
  };

  const currentStatus = statusConfig[suggestion.status] || statusConfig.Pending;
  const StatusIcon = currentStatus.icon;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const canManage = session?.user?.permissions?.canManageSuggestions ?? false;
  const isPendingReview = suggestion.status === "Pending";

  const totalKolom1 = assessmentData.original + assessmentData.hoshinKanri + assessmentData.yokoten;
  const totalSQCDMPE = Object.values(assessmentData.sqcdmpe).reduce((a, b) => a + b, 0);
  const totalKeseluruhan = totalKolom1 + totalSQCDMPE;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/suggestions"
            className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-slate-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight font-display">
                {suggestion.title}
              </h1>
              <span className={`px-3 py-1 ${currentStatus.bg} ${currentStatus.color} text-xs font-bold rounded-full flex items-center gap-1`}>
                <StatusIcon className="w-3 h-3" /> {currentStatus.label}
              </span>
            </div>
            <p className="text-gray-500 text-sm font-medium flex items-center gap-4">
              <span>ID: <span className="font-bold text-slate-700">#{suggestion._id.substring(suggestion._id.length - 6).toUpperCase()}</span></span>
              <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
              <span className="flex items-center gap-1"><Award className="w-4 h-4 text-amber-500" /> +{suggestion.pointsAwarded || 0} Poin</span>
            </p>
          </div>
        </div>

        {suggestion.status === "Approved" && (
          <button
            onClick={async () => {
              setIsDownloading(true);
              try {
                const res = await fetch(`/api/suggestions/${suggestionId}/document`);
                if (!res.ok) {
                  const err = await res.json();
                  alert(err.error || "Gagal generate dokumen.");
                  return;
                }
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const disposition = res.headers.get("Content-Disposition");
                const match = disposition?.match(/filename="(.+)"/);
                a.download = match ? match[1] : `suggestion_${suggestionId}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
              } catch (err) {
                console.error(err);
                alert("Terjadi kesalahan saat mengunduh dokumen.");
              } finally {
                setIsDownloading(false);
              }
            }}
            disabled={isDownloading}
            className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? "Mengunduh..." : "Download Dokumen"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN: MAIN CONTENT */}
        <div className="lg:col-span-2 space-y-6">

          {/* Detail Masalah & Solusi */}
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-8">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-6 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Kategori</p>
                <p className="text-sm font-bold text-slate-800 line-clamp-1" title={suggestion.category}>{suggestion.category.split('/')[0].trim()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Departemen</p>
                <p className="text-sm font-bold text-slate-800">{suggestion.department?.name || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Tanggal Pengajuan</p>
                <p className="text-sm font-bold text-slate-800">{formatDate(suggestion.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Status Validasi</p>
                <p className="text-sm font-bold text-slate-800">{suggestion.status === "Approved" ? "Disetujui" : (suggestion.status === "Pending" ? "Menunggu" : suggestion.status)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800">Kondisi Saat Ini (Masalah)</h3>
              <div className="p-4 bg-red-50/50 rounded-2xl border border-red-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                {suggestion.problem}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800">Solusi yang Diusulkan</h3>
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                {suggestion.solution}
              </div>
            </div>

            {(suggestion.costEffective?.explanation || suggestion.costEffective?.nominal > 0) && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-800">Efisiensi Biaya (Cost Effective)</h3>
                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {suggestion.costEffective?.nominal > 0 && (
                    <div className="mb-2 font-bold text-blue-800">
                      Estimasi Hemat: Rp {suggestion.costEffective.nominal.toLocaleString('id-ID')}
                    </div>
                  )}
                  {suggestion.costEffective?.explanation && (
                    <p>{suggestion.costEffective.explanation}</p>
                  )}
                </div>
              </div>
            )}

            {/* Riwayat Revisi */}
            {suggestion.revisionHistory && suggestion.revisionHistory.length > 0 && (
              <div className="space-y-4 pt-6 border-t border-gray-100">
                <h3 className="text-base font-bold text-slate-800">Riwayat Revisi</h3>
                <div className="space-y-3">
                  {suggestion.revisionHistory.map((revision: any, idx: number) => (
                    <details key={idx} className="cursor-pointer group">
                      <summary className="font-semibold text-slate-700 py-3 px-4 bg-gray-50 rounded-2xl border border-gray-200 hover:bg-gray-100 transition-colors list-none flex items-center justify-between select-none">
                        <span>Revisi {suggestion.revisionHistory.length - idx}: {formatDate(revision.editedAt)}</span>
                        <span className="transform group-open:rotate-180 transition-transform text-gray-500">▼</span>
                      </summary>
                      <div className="mt-3 space-y-4 bg-gray-50 p-4 rounded-2xl border border-gray-200">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Kategori (saat edit)</p>
                            <p className="text-sm font-bold text-slate-800">{revision.category?.split('/')[0]?.trim() || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Departemen (saat edit)</p>
                            <p className="text-sm font-bold text-slate-800">{revision.department?.name || "-"}</p>
                          </div>
                        </div>
                        {revision.title && (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Judul</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{revision.title}</p>
                          </div>
                        )}
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Masalah (saat edit)</p>
                          <div className="p-4 bg-red-50/50 rounded-2xl border border-red-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                            {revision.problem}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Solusi (saat edit)</p>
                          <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                            {revision.solution}
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {suggestion.status === "Approved" && suggestion.assessment && (
              <div className="space-y-4 pt-6 border-t border-gray-100">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" /> Detail Penilaian (Assessment)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700 mb-2 border-b border-gray-200 pb-2">A. Kriteria Penilaian (Maks 60)</h4>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Original</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.original || 0} <span className="text-gray-400 font-normal">/ 25</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Hoshin Kanri</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.hoshinKanri || 0} <span className="text-gray-400 font-normal">/ 20</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Yokoten</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.yokoten || 0} <span className="text-gray-400 font-normal">/ 15</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-200">
                      <span className="text-gray-700 font-bold">Subtotal</span>
                      <span className="font-bold text-indigo-600">{(suggestion.assessment.original || 0) + (suggestion.assessment.hoshinKanri || 0) + (suggestion.assessment.yokoten || 0)} <span className="text-gray-400 font-normal">/ 60</span></span>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700 mb-2 border-b border-gray-200 pb-2">B. Dampak SQCDMPE+P (Maks 40)</h4>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Safety (S)</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.sqcdmpe?.safety || 0} <span className="text-gray-400 font-normal">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Quality (Q)</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.sqcdmpe?.quality || 0} <span className="text-gray-400 font-normal">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Cost (C)</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.sqcdmpe?.cost || 0} <span className="text-gray-400 font-normal">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Delivery (D)</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.sqcdmpe?.delivery || 0} <span className="text-gray-400 font-normal">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Morale (M)</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.sqcdmpe?.morale || 0} <span className="text-gray-400 font-normal">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Productivity (P)</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.sqcdmpe?.productivity || 0} <span className="text-gray-400 font-normal">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Environment (E)</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.sqcdmpe?.environment || 0} <span className="text-gray-400 font-normal">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">People Dev. (P)</span>
                      <span className="font-bold text-slate-800">{suggestion.assessment.sqcdmpe?.peopleDevelopment || 0} <span className="text-gray-400 font-normal">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-200">
                      <span className="text-gray-700 font-bold">Subtotal</span>
                      <span className="font-bold text-blue-600">
                        {(suggestion.assessment.sqcdmpe?.safety || 0) + (suggestion.assessment.sqcdmpe?.quality || 0) + (suggestion.assessment.sqcdmpe?.cost || 0) + (suggestion.assessment.sqcdmpe?.delivery || 0) + (suggestion.assessment.sqcdmpe?.morale || 0) + (suggestion.assessment.sqcdmpe?.productivity || 0) + (suggestion.assessment.sqcdmpe?.environment || 0) + (suggestion.assessment.sqcdmpe?.peopleDevelopment || 0)} <span className="text-gray-400 font-normal">/ 40</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                   <div className="px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl inline-flex items-center gap-2">
                     <span className="text-sm text-amber-800 font-medium">Total Poin Evaluasi:</span>
                     <span className="text-lg font-bold text-amber-600">{suggestion.pointsAwarded || 0} <span className="text-sm font-normal text-amber-400">/ 100</span></span>
                   </div>
                </div>
              </div>
            )}

          </div>

          {/* Before & After Photos */}
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
            <h3 className="text-base font-bold text-slate-800 mb-6">Dokumentasi Visual (Before / After)</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Before */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">BEFORE</span>
                </div>
                <div className="aspect-video bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden relative group">
                  {suggestion.images?.before ? (
                    <button type="button" onClick={() => setLightboxSrc(suggestion.images.before)} className="w-full h-full block cursor-zoom-in">
                      <img src={suggestion.images.before} alt="Before" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </button>
                  ) : (
                    <div className="w-full h-full bg-slate-200 flex flex-col items-center justify-center text-slate-400">
                      <span className="text-4xl">📷</span>
                      <span className="text-xs mt-2 font-medium">Tidak ada foto before</span>
                    </div>
                  )}
                </div>
              </div>

              {/* After */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">AFTER</span>
                </div>
                <div className="aspect-video bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden relative group">
                  {suggestion.images?.after ? (
                    <button type="button" onClick={() => setLightboxSrc(suggestion.images.after)} className="w-full h-full block cursor-zoom-in">
                      <img src={suggestion.images.after} alt="After" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </button>
                  ) : (
                    <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center text-slate-400">
                      <span className="text-4xl">📷</span>
                      <span className="text-xs mt-2 font-medium">Tidak ada foto after</span>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {suggestion.images?.additional?.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">FOTO TAMBAHAN</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {suggestion.images.additional.map((src: string, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setLightboxSrc(src)}
                      className="aspect-video bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden group cursor-zoom-in"
                    >
                      <img src={src} alt={`Foto tambahan ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: SIDEBAR */}
        <div className="lg:col-span-1 space-y-6">

          {/* Tinjauan Reviewer — the one bold moment on this page, only for
              a reviewer looking at an idea that's actually awaiting them. */}
          {isPendingReview && canManage && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border-2 border-primary/15">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1">Tinjauan Reviewer</h3>
              <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                Ide ini menunggu keputusan kamu. Setujui dengan mengisi rubrik penilaian, atau tolak jika tidak layak dilanjutkan.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleOpenAssessment}
                  disabled={!!reviewAction}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                >
                  <CheckCircle className="w-5 h-5" />
                  Setujui Ide
                </button>
                <button
                  onClick={handleReject}
                  disabled={!!reviewAction}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-700 font-bold rounded-xl border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" />
                  {reviewAction === "reject" ? "Menolak..." : "Tolak Ide"}
                </button>
              </div>
            </div>
          )}

          {/* Info Pengaju */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-gray-100 pb-3">Informasi Pengaju</h3>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg font-display">
                {getInitials(suggestion.author?.name)}
              </div>
              <div>
                <p className="font-bold text-slate-800">{suggestion.author?.name || "Unknown User"}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3" /> NIK: {suggestion.author?.nik || "-"}</p>
              </div>
            </div>
          </div>

          {/* Linimasa Status */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-5 border-b border-gray-100 pb-3">Linimasa</h3>

            <ol className="relative border-l-2 border-gray-100 ml-3 space-y-6">
              <li className="relative pl-6">
                <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow" />
                <p className="font-bold text-slate-800 text-sm">Ide Diajukan</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatDate(suggestion.submittedAt || suggestion.createdAt)}</p>
              </li>

              {suggestion.status === "Pending" && (
                <li className="relative pl-6">
                  <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-amber-400 border-2 border-white shadow" />
                  <p className="font-bold text-slate-800 text-sm">Menunggu Review</p>
                  <p className="text-xs text-gray-500 mt-0.5">Sedang ditinjau oleh approver</p>
                </li>
              )}

              {suggestion.status === "Revision" && (
                <li className="relative pl-6">
                  <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-blue-400 border-2 border-white shadow" />
                  <p className="font-bold text-slate-800 text-sm">Butuh Revisi</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(suggestion.updatedAt)}</p>
                </li>
              )}

              {suggestion.status === "Approved" && (
                <li className="relative pl-6">
                  <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow" />
                  <p className="font-bold text-slate-800 text-sm">Disetujui</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(suggestion.updatedAt)}</p>
                </li>
              )}

              {suggestion.status === "Rejected" && (
                <li className="relative pl-6">
                  <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow" />
                  <p className="font-bold text-slate-800 text-sm">Ditolak</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(suggestion.updatedAt)}</p>
                </li>
              )}
            </ol>
          </div>

          {/* Kolom Diskusi / Komentar */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-[500px]">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500" /> Diskusi & Catatan
              </h3>
            </div>

            {/* Chat Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
              {!suggestion.comments || suggestion.comments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-xs text-gray-400 font-medium">Belum ada diskusi untuk suggestion ini.</p>
                </div>
              ) : (
                suggestion.comments.map((comment: any, idx: number) => {
                  const isSelf = session?.user?.id === comment.author?._id;
                  return (
                    <div key={idx} className={`flex gap-3 ${isSelf ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${isSelf ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {getInitials(comment.author?.name)}
                      </div>
                      <div className={isSelf ? 'text-right' : ''}>
                        <div className={`p-3 rounded-2xl shadow-sm text-sm ${isSelf ? 'bg-primary text-white rounded-tr-none text-left' : 'bg-white border border-gray-100 text-slate-700 rounded-tl-none'}`}>
                          {comment.text}
                        </div>
                        <p className={`text-[10px] text-gray-400 mt-1 ${isSelf ? 'mr-1' : 'ml-1'}`}>
                          {comment.author?.name} • {new Date(comment.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Chat */}
            <form onSubmit={handleSubmitComment} className="p-3 bg-white border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Tulis komentar..."
                disabled={isSubmittingComment}
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isSubmittingComment || !commentText.trim()}
                className="w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>
      </div>

      {/* RUBRIC ASSESSMENT MODAL */}
      {assessmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold font-display text-slate-800">Kolom Penilaian (Rubrik Approval)</h3>
                <button onClick={() => setAssessmentModalOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">Berikan penilaian untuk menyetujui <span className="font-bold text-primary">{suggestion.title}</span>.</p>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">

              {/* GUIDANCE TOGGLE */}
              <div className="mb-6 bg-blue-50/50 rounded-xl border border-blue-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowGuidance(!showGuidance)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-blue-800 font-bold">
                    <Info className="w-5 h-5 text-blue-600" />
                    Panduan & Matrix Penilaian
                  </div>
                  {showGuidance ? <ChevronUp className="w-5 h-5 text-blue-600" /> : <ChevronDown className="w-5 h-5 text-blue-600" />}
                </button>

                {showGuidance && (
                  <div className="p-4 pt-0 text-sm text-slate-700 space-y-4 border-t border-blue-100/50 mt-2">
                    <div>
                      <h5 className="font-bold mb-1">A. Kriteria Penilaian (Maks 60 Poin)</h5>
                      <ul className="list-disc pl-5 space-y-1 text-gray-600">
                        <li><strong>Original (Maks 25):</strong> Ide murni, baru, dan tingkat kreativitas tinggi.</li>
                        <li><strong>Hoshin Kanri (Maks 20):</strong> Keselarasan ide dengan target/KPI perusahaan atau departemen.</li>
                        <li><strong>Yokoten (Maks 15):</strong> Potensi atau hasil dari penyebaran/penerapan ide di area atau mesin lain.</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-bold mb-1">B. Dampak SQCDMPE+P (Skala 1-5)</h5>
                      <p className="text-gray-600 mb-2">Pilih tingkat dampak improvement untuk setiap kategori berdasarkan skala berikut:</p>
                      <div className="grid grid-cols-5 gap-2 text-center text-xs font-medium">
                        <div className="bg-white p-2 rounded border border-gray-200">1: Sangat Rendah</div>
                        <div className="bg-white p-2 rounded border border-gray-200">2: Rendah</div>
                        <div className="bg-white p-2 rounded border border-gray-200">3: Sedang</div>
                        <div className="bg-white p-2 rounded border border-gray-200">4: Tinggi</div>
                        <div className="bg-white p-2 rounded border border-gray-200">5: Sangat Tinggi</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form id="assessmentForm" onSubmit={handleSubmitAssessment} className="space-y-8">

                {/* Kolom #1: Kriteria Penilaian (60 poin) */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-4 pb-2 border-b border-gray-100 flex justify-between items-end">
                    <span>A. Kriteria Penilaian</span>
                    <span className="text-xs font-medium text-gray-500 font-sans">Total Maksimal 60 Poin</span>
                  </h4>
                  <div className="space-y-4">
                    {[
                      { key: 'original', label: '1. Original', desc: 'Keaslian ide dan kreativitas improvement', max: 25 },
                      { key: 'hoshinKanri', label: '2. Hoshin Kanri', desc: 'Tingkat keselarasan dengan target perusahaan', max: 20 },
                      { key: 'yokoten', label: '3. Yokoten', desc: 'Hasil pengembangan atau penyebaran horizontal dari kaizen', max: 15 }
                    ].map(item => (
                      <div key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-slate-700">{item.label}</label>
                          <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min="0" max={item.max} required
                            className="w-20 text-center px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold text-slate-800"
                            value={(assessmentData as any)[item.key]}
                            onChange={(e) => setAssessmentData({...assessmentData, [item.key]: parseInt(e.target.value) || 0})}
                          />
                          <span className="text-xs font-bold text-gray-400 uppercase">/ {item.max}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-indigo-800">Subtotal Kriteria:</span>
                    <span className={`text-lg font-bold font-display ${totalKolom1 > 60 ? 'text-red-500' : 'text-indigo-600'}`}>
                      {totalKolom1} <span className="text-sm font-sans text-indigo-400">/ 60</span>
                    </span>
                  </div>
                </div>

                {/* Kolom #2: Dampak Improvement SQCDMPE+P (40 poin) */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-4 pb-2 border-b border-gray-100 flex justify-between items-end">
                    <span>B. Dampak Improvement (SQCDMPE + P)</span>
                    <span className="text-xs font-medium text-gray-500 font-sans">Total Maksimal 40 Poin — Skala 1–5</span>
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { key: 'safety', label: 'Safety (S)' },
                      { key: 'quality', label: 'Quality (Q)' },
                      { key: 'cost', label: 'Cost (C)' },
                      { key: 'delivery', label: 'Delivery (D)' },
                      { key: 'morale', label: 'Morale (M)' },
                      { key: 'productivity', label: 'Productivity (P)' },
                      { key: 'environment', label: 'Environment (E)' },
                      { key: 'peopleDevelopment', label: 'People Dev. (P)' }
                    ].map(item => (
                      <div key={item.key} className="flex flex-col p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <label className="text-xs font-bold text-slate-700 mb-2">{item.label}</label>
                        <select
                          required
                          className="w-full text-center px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold text-slate-800 bg-white"
                          value={(assessmentData.sqcdmpe as any)[item.key]}
                          onChange={(e) => setAssessmentData({
                            ...assessmentData,
                            sqcdmpe: { ...assessmentData.sqcdmpe, [item.key]: parseInt(e.target.value) || 0 }
                          })}
                        >
                          <option value={0}>0</option>
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                          <option value={5}>5</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-blue-800">Subtotal SQCDMPE+P:</span>
                    <span className={`text-lg font-bold font-display ${totalSQCDMPE > 40 ? 'text-red-500' : 'text-primary'}`}>
                      {totalSQCDMPE} <span className="text-sm font-sans text-blue-400">/ 40</span>
                    </span>
                  </div>
                </div>

                {/* Cost Impact */}
                {suggestion.category === "Cost Down / Efisiensi Biaya Operasional" && (
                  <div>
                    <h4 className="font-bold text-emerald-800 mb-2">Estimasi Penghematan (Rp)</h4>
                    <input
                      type="number" min="0" required
                      className="w-full px-4 py-3 border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold text-slate-800 bg-emerald-50/30"
                      placeholder="Contoh: 1500000"
                      value={assessmentData.costImpact || ''}
                      onChange={(e) => setAssessmentData({...assessmentData, costImpact: parseInt(e.target.value) || 0})}
                    />
                    <p className="text-xs text-gray-500 mt-2">Karena ini kategori Cost Down, mohon masukkan nominal penghematan jika ada.</p>
                  </div>
                )}
              </form>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div className="text-slate-800 font-bold">
                Total Poin Keseluruhan: <span className="text-2xl text-primary font-display ml-2">
                  {totalKeseluruhan}
                </span>
                <span className="text-sm text-gray-400 font-sans ml-1">/ 100</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAssessmentModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit" form="assessmentForm"
                  disabled={reviewAction === "approve" || totalSQCDMPE > 40 || totalKolom1 > 60}
                  className="px-6 py-2.5 rounded-xl font-bold text-white bg-primary hover:bg-blue-700 transition-all shadow-sm hover:shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  {reviewAction === "approve" ? "Memproses..." : "Approve Ide"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE LIGHTBOX */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxSrc}
            alt="Preview"
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
