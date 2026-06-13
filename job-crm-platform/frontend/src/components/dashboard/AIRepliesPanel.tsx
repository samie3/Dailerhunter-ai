"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Bot, CheckCircle, XCircle } from "lucide-react";
import api from "@/lib/api";

export function AIRepliesPanel() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["pending-replies"],
    queryFn: () => api.get("/api/email/pending-replies").then((r) => r.data),
    refetchInterval: 20_000,
  });

  const approveMutation = useMutation({
    mutationFn: (replyId: string) => api.post("/api/email/approve", { replyId }),
    onSuccess: () => { toast.success("Reply approved & queued"); qc.invalidateQueries({ queryKey: ["pending-replies"] }); },
    onError: () => toast.error("Approval failed"),
  });

  const replies = data?.replies ?? [];

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bot size={18} className="text-purple-600" />
        <h3 className="font-semibold text-sm">AI Drafts</h3>
        {replies.length > 0 && (
          <span className="ml-auto bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {replies.length}
          </span>
        )}
      </div>

      {replies.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">No pending drafts</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {replies.map((r: any) => (
            <div key={r.id} className="border rounded-lg p-3">
              <p className="text-xs font-medium text-gray-700 mb-1">{r.lead?.companyName}</p>
              <p className="text-xs text-gray-500 truncate">{r.draftSubject}</p>
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">{r.draftBody}</p>
              <button
                onClick={() => approveMutation.mutate(r.id)}
                disabled={approveMutation.isPending}
                className="mt-2 flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
              >
                <CheckCircle size={13} /> Approve & Send
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
