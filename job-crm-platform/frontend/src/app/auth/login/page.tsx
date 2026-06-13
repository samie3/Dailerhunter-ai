"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });

  const login = useMutation({
    mutationFn: () => api.post("/api/auth/login", form),
    onSuccess: (res) => {
      localStorage.setItem("token", res.data.token);
      router.push("/dashboard");
    },
    onError: (e: any) => toast.error(e.response?.data?.error || "Login failed"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-xl font-bold mb-6">Sign In</h1>
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 mb-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 mb-4 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => login.mutate()}
          disabled={login.isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {login.isPending ? "Signing in…" : "Sign In"}
        </button>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/google`}
          className="mt-3 flex items-center justify-center gap-2 border rounded-lg py-2 text-sm hover:bg-gray-50 transition"
        >
          Continue with Google
        </a>
        <p className="text-xs text-center text-gray-400 mt-4">
          No account? <a href="/auth/register" className="text-blue-600">Register</a>
        </p>
      </div>
    </div>
  );
}
