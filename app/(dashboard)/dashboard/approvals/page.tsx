"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, CheckCircle } from "lucide-react";

export default function ApprovalsPage() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/suggestions")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setApprovals(data.filter((s: any) => s.status === "Pending"));
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      
      {/* HEADER & ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display text-slate-800">Pending Approvals</h2>
          <p className="text-sm text-gray-500 mt-1">Click a suggestion to open its full detail — approve or reject from there.</p>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-gray-400" />
          </div>
          <input 
            type="text" 
            placeholder="Search by ID or Proposer Name..." 
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <div className="flex gap-3">
          <select className="bg-gray-50 border border-gray-200 text-sm rounded-xl px-4 py-2.5 text-slate-700 focus:outline-none focus:border-primary w-full md:w-auto">
            <option>All Categories</option>
            <option>Safety</option>
            <option>Quality</option>
            <option>Cost Down</option>
          </select>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Suggestion Details</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Idea Snippet</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-400">Loading approvals...</td>
                </tr>
              ) : approvals.length > 0 ? (
                approvals.map((item) => {
                  let categoryBadge = "bg-gray-100 text-gray-800";
                  if (item.category === "Safety / 5S / Lingkungan") categoryBadge = "bg-purple-100 text-purple-800";
                  if (item.category === "Quality / Product Improvement") categoryBadge = "bg-blue-100 text-blue-800";
                  if (item.category === "Cost Down / Efisiensi Biaya Operasional") categoryBadge = "bg-emerald-100 text-emerald-800";

                  return (
                    <tr
                      key={item._id}
                      onClick={() => router.push(`/dashboard/suggestions/${item._id}`)}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-800">{item._id.substring(item._id.length - 8).toUpperCase()}</div>
                        <div className="text-sm font-medium text-primary mt-1">{item.author?.name || "Unknown"}</div>
                        <div className="text-xs text-gray-500 mt-0.5">Submitted: {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${categoryBadge}`}>
                          {item.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell max-w-xs">
                        <p className="text-sm text-gray-800 font-bold truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate mt-1">{item.problem}</p>
                        {item.costEffective?.nominal > 0 && (
                          <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100">
                            Hemat: Rp {item.costEffective.nominal.toLocaleString('id-ID')}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end">
                          <span className="flex items-center gap-1 text-xs font-bold text-gray-400">
                            Lihat detail
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4}>
                    <div className="p-12 flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-green-500" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 font-display">All Caught Up!</h3>
                      <p className="text-sm text-gray-500 mt-2 max-w-sm">You have no pending suggestions waiting for your approval at this time.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
