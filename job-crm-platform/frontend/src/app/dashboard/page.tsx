"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Play, Square, Upload, BarChart2, Mail, MessageCircle, Clock } from "lucide-react";
import api from "@/lib/api";
import { AnalyticsChart } from "@/components/dashboard/AnalyticsChart";
import { StatCard } from "@/components/dashboard/StatCard";
import { AIRepliesPanel } from "@/components/dashboard/AIRepliesPanel";
import { CVUpload } from "@/components/dashboard/CVUpload";
import { WhatsAppPanel } from "@/components/dashboard/WhatsAppPanel";

const SECTORS = [
  "Software Engineering",
  "Data Science",
  "Product Management",
  "Marketing",
  "Finance",
  "Sales",
  "Design",
  "Operations",
  "Healthcare",
  "Education",
];

export default function Dashboard() {
  const qc = useQueryClient();
  const [sector, setSector] = useState("Software Engineering");
  const [city, setCity] = useState("");
  const [dailyLimit, setDailyLimit] = useState(45);

  const { data: status } = useQuery({
    queryKey: ["sequence-status"],
    queryFn: () => api.get("/api/sequence/status").then((r) => r.data),
    refetchInterval: 15_000,
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api.get("/api/analytics").then((r) => r.data),
    refetchInterval: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: () => api.post("/api/sequence/start", { sector, city, dailyLimit }),
    onSuccess: () => { toast.success("Sequence started!"); qc.invalidateQueries({ queryKey: ["sequence-status"] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || "Failed to start"),
  });

  const stopMutation = useMutation({
    mutationFn: () => api.post("/api/sequence/stop"),
    onSuccess: () => { toast.success("Sequence paused"); qc.invalidateQueries({ queryKey: ["sequence-status"] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || "Failed to stop"),
  });

  const isRunning = status?.sequence?.status === "RUNNING";
  const stats = status?.stats || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Job CRM Platform</h1>
          <p className="text-sm text-gray-500">Automated job application engine</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            isRunning ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}>
            {isRunning ? "● Running" : "○ Idle"}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Leads" value={status?.totals ?? 0} icon={<BarChart2 size={18} />} color="blue" />
          <StatCard label="Sent" value={stats.sent ?? 0} icon={<Mail size={18} />} color="green" />
          <StatCard label="Opened" value={stats.opened ?? 0} icon={<Mail size={18} />} color="yellow" />
          <StatCard label="Replied" value={stats.replied ?? 0} icon={<MessageCircle size={18} />} color="purple" />
        </div>

        {/* Sequence Controls */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-base font-semibold mb-4">Sequence Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sector</label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {SECTORS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. New York"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Daily Limit
                <span className="ml-2 text-xs text-gray-400 font-normal">(Day {status?.sequence?.dayNumber || 1} quota: {status?.todayQuota ?? 45})</span>
              </label>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                min={1}
                max={490}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => startMutation.mutate()}
              disabled={isRunning || startMutation.isPending || !city}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Play size={16} /> Start Sequence
            </button>
            <button
              onClick={() => stopMutation.mutate()}
              disabled={!isRunning || stopMutation.isPending}
              className="flex items-center gap-2 bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <Square size={16} /> Stop
            </button>
          </div>

          {/* Ramp schedule hint */}
          <div className="mt-4 flex gap-2 flex-wrap">
            {[45, 90, 180, 360, 490].map((q, i) => (
              <span key={i} className={`px-2 py-1 rounded text-xs font-medium ${
                (status?.sequence?.dayNumber || 1) - 1 === i
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}>
                Day {i + 1}: {q}
              </span>
            ))}
          </div>
        </div>

        {/* Analytics Chart */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-base font-semibold mb-4">Activity (Last 7 Days)</h2>
          <AnalyticsChart data={analytics?.daily ?? []} />
        </div>

        {/* Lower panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CVUpload />
          <AIRepliesPanel />
          <WhatsAppPanel />
        </div>
      </main>
    </div>
  );
}
