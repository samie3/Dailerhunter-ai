"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      localStorage.setItem("token", token);
      router.replace("/dashboard");
    } else {
      router.replace("/auth/login");
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 text-sm">Authenticating…</p>
    </div>
  );
}
