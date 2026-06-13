"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { MessageCircle, Smartphone } from "lucide-react";
import api from "@/lib/api";

export function WhatsAppPanel() {
  const [phone, setPhone] = useState("");
  const qc = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["wa-status"],
    queryFn: () => api.get("/api/whatsapp/status").then((r) => r.data).catch(() => null),
  });

  const pairMutation = useMutation({
    mutationFn: () => api.post("/api/whatsapp/pair", { phoneNumber: phone }),
    onSuccess: (res) => {
      toast.success(`Pairing code: ${res.data.pairingCode}`, { duration: 20000 });
      qc.invalidateQueries({ queryKey: ["wa-status"] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || "Pairing failed"),
  });

  const paired = status?.session?.paired;

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle size={18} className="text-green-600" />
        <h3 className="font-semibold text-sm">WhatsApp (Pro)</h3>
        {paired && (
          <span className="ml-auto bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
            Connected
          </span>
        )}
      </div>

      {paired ? (
        <div className="text-center py-4">
          <Smartphone size={32} className="mx-auto mb-2 text-green-500" />
          <p className="text-xs text-gray-600">
            Linked: <span className="font-medium">{status?.session?.phoneNumber}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Capped at 100 messages/day</p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Enter your WhatsApp number to receive an 8-digit pairing code.
          </p>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 234 567 8900"
            className="w-full border rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-green-500 outline-none"
          />
          <button
            onClick={() => pairMutation.mutate()}
            disabled={!phone || pairMutation.isPending}
            className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
          >
            {pairMutation.isPending ? "Pairing…" : "Get Pairing Code"}
          </button>
        </div>
      )}
    </div>
  );
}
