"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle,
  XCircle,
  Rocket,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  PlusCircle,
} from "lucide-react";

type DraftStatus = "draft" | "approved" | "rejected" | "launched";

interface Draft {
  id: string;
  title: string;
  product_title?: string;
  script: string;
  video_url?: string;
  video_status: string;
  status: DraftStatus;
  rejection_reason?: string;
  campaign_name?: string;
  budget?: number;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<DraftStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: {
    label: "ממתין לאישור",
    color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    icon: <Clock size={14} />,
  },
  approved: {
    label: "אושר",
    color: "text-green-400 bg-green-400/10 border-green-400/20",
    icon: <CheckCircle size={14} />,
  },
  rejected: {
    label: "נדחה",
    color: "text-red-400 bg-red-400/10 border-red-400/20",
    icon: <XCircle size={14} />,
  },
  launched: {
    label: "הושק",
    color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    icon: <Rocket size={14} />,
  },
};

function StatusBadge({ status }: { status: DraftStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected] = useState<Draft | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [launchData, setLaunchData] = useState({ ad_account_id: "", campaign_name: "", budget: "" });
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterStatus === "all" ? "/api/drafts" : `/api/drafts?status=${filterStatus}`;
      const res = await fetch(url);
      const data = await res.json();
      setDrafts(data.drafts ?? []);
    } catch {
      showToast("טעינת הטיוטות נכשלה", "error");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleApprove = async (draft: Draft) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`"${draft.title}" אושר`, "success");
      setSelected(data.draft);
      await fetchDrafts();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "האישור נכשל", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/drafts/${selected.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`"${selected.title}" נדחה`, "success");
      setShowRejectModal(false);
      setRejectReason("");
      setSelected(data.draft);
      await fetchDrafts();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "הדחייה נכשלה", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLaunch = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/drafts/${selected.id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_account_id: launchData.ad_account_id || undefined,
          campaign_name: launchData.campaign_name || undefined,
          budget: launchData.budget ? Number(launchData.budget) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`"${selected.title}" הושק למטא`, "success");
      setShowLaunchModal(false);
      setLaunchData({ ad_account_id: "", campaign_name: "", budget: "" });
      setSelected(data.draft);
      await fetchDrafts();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "ההשקה נכשלה", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = filterStatus === "all" ? drafts : drafts.filter((d) => d.status === filterStatus);
  const counts = {
    all: drafts.length,
    draft: drafts.filter((d) => d.status === "draft").length,
    approved: drafts.filter((d) => d.status === "approved").length,
    rejected: drafts.filter((d) => d.status === "rejected").length,
    launched: drafts.filter((d) => d.status === "launched").length,
  };

  return (
    <div className="min-h-screen bg-black text-gray-100">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">תור הטיוטות</h1>
            <p className="text-gray-400 text-sm mt-1">בדקו ואשרו פרסומות לפני ההשקה למטא</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchDrafts}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              רענון
            </button>
            <Link
              href="/app/generate"
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
            >
              <PlusCircle size={14} />
              פרסומת חדשה
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 bg-gray-900 p-1 rounded-lg w-fit">
          {(["all", "draft", "approved", "rejected", "launched"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filterStatus === s
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {s === "all" ? "הכל" : STATUS_CONFIG[s as DraftStatus].label}{" "}
              <span className="text-xs opacity-60">({counts[s]})</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-800 rounded-xl animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Clock size={32} className="mx-auto mb-3 opacity-40" />
                <p>לא נמצאו טיוטות</p>
              </div>
            ) : (
              filtered.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => setSelected(draft)}
                  className={`w-full text-start p-4 rounded-xl border transition-all ${
                    selected?.id === draft.id
                      ? "border-violet-500 bg-violet-500/10"
                      : "border-gray-800 bg-gray-900 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{draft.title}</p>
                      {draft.product_title && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{draft.product_title}</p>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-gray-600 flex-shrink-0 mt-0.5 rotate-180" />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <StatusBadge status={draft.status} />
                    <span className="text-xs text-gray-600">
                      {new Date(draft.created_at).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-gray-600 border border-dashed border-gray-800 rounded-xl p-12">
                <div className="text-center">
                  <Clock size={40} className="mx-auto mb-3 opacity-40" />
                  <p>בחרו טיוטה לבדיקה</p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
                {/* Title row */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold">{selected.title}</h2>
                    {selected.product_title && (
                      <p className="text-sm text-gray-400 mt-0.5">{selected.product_title}</p>
                    )}
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                {/* Video preview */}
                {selected.video_url && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 tracking-wider mb-2">סרטון</p>
                    <video
                      src={selected.video_url}
                      controls
                      className="w-full max-h-72 rounded-lg bg-black object-contain"
                    />
                  </div>
                )}

                {/* Script */}
                <div>
                  <p className="text-xs font-medium text-gray-500 tracking-wider mb-2">תסריט</p>
                  <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selected.script}
                  </div>
                </div>

                {/* Meta config */}
                {(selected.campaign_name || selected.budget) && (
                  <div className="grid grid-cols-2 gap-3">
                    {selected.campaign_name && (
                      <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">שם הקמפיין</p>
                        <p className="text-sm font-medium">{selected.campaign_name}</p>
                      </div>
                    )}
                    {selected.budget && (
                      <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">תקציב יומי</p>
                        <p className="text-sm font-medium">${(selected.budget / 100).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Rejection reason */}
                {selected.status === "rejected" && selected.rejection_reason && (
                  <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4">
                    <p className="text-xs font-medium text-red-400 tracking-wider mb-1">סיבת הדחייה</p>
                    <p className="text-sm text-red-300">{selected.rejection_reason}</p>
                  </div>
                )}

                {/* Actions */}
                {selected.status === "draft" && (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => handleApprove(selected)}
                      disabled={actionLoading}
                      className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <CheckCircle size={16} />
                      אישור
                    </button>
                    <button
                      onClick={() => { setShowRejectModal(true); }}
                      disabled={actionLoading}
                      className="flex items-center gap-2 px-4 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <XCircle size={16} />
                      דחייה
                    </button>
                  </div>
                )}

                {selected.status === "approved" && (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setLaunchData({
                          ad_account_id: "",
                          campaign_name: selected.campaign_name ?? "",
                          budget: selected.budget ? String(selected.budget) : "",
                        });
                        setShowLaunchModal(true);
                      }}
                      disabled={actionLoading || !selected.video_url}
                      className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Rocket size={16} />
                      השקה למטא
                    </button>
                    {!selected.video_url && (
                      <p className="text-xs text-yellow-400">נדרש סרטון לפני ההשקה</p>
                    )}
                  </div>
                )}

                {selected.status === "launched" && (
                  <div className="flex items-center gap-2 text-blue-400 text-sm">
                    <Rocket size={16} />
                    הפרסומת הזו הושקה למטא.
                    <Link href="/app/launch" className="underline hover:text-blue-300">צפייה בקמפיינים</Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-1">דחיית טיוטה</h3>
            <p className="text-sm text-gray-400 mb-4">אפשר לציין סיבה לדחיית "{selected.title}"</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="סיבת הדחייה (לא חובה)"
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {actionLoading ? "דוחה" : "אישור הדחייה"}
              </button>
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(""); }}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Launch Modal */}
      {showLaunchModal && selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-1">השקה למטא</h3>
            <p className="text-sm text-gray-400 mb-4">הגדרות מטא לפרסומת "{selected.title}"</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">מזהה חשבון מודעות</label>
                <input
                  type="text"
                  placeholder="act_XXXXXXXXXXXXXXXX"
                  value={launchData.ad_account_id}
                  onChange={(e) => setLaunchData((p) => ({ ...p, ad_account_id: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 ltr-island"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">שם הקמפיין</label>
                <input
                  type="text"
                  placeholder="הקמפיין שלי"
                  value={launchData.campaign_name}
                  onChange={(e) => setLaunchData((p) => ({ ...p, campaign_name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">תקציב יומי (בסנטים, לדוגמה 1000 שווה 10 דולר)</label>
                <input
                  type="number"
                  placeholder="1000"
                  value={launchData.budget}
                  onChange={(e) => setLaunchData((p) => ({ ...p, budget: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 ltr-island"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={handleLaunch}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                <Rocket size={14} />
                {actionLoading ? "משיק" : "השקה"}
              </button>
              <button
                onClick={() => { setShowLaunchModal(false); }}
                className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
