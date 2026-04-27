"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Menghubungkan akun Anda...");

  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const code = params?.get("code");
    const next = params?.get("next") || "/";

    if (!code) {
      setStatus("error");
      setMessage("Kode otentikasi tidak ditemukan. Silakan coba lagi.");
      return;
    }

    const handleCallback = async () => {
      const response = await fetch(`/api/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
      const result = await response.json();
      if (!response.ok || !result.success) {
        console.error("Auth callback error", result.error);
        setStatus("error");
        setMessage("Terjadi kesalahan saat masuk. Silakan coba lagi.");
        return;
      }

      setStatus("success");
      setMessage("Login berhasil! Mengarahkan Anda ke dasbor...");
      router.replace(result.next || next);
    };

    void handleCallback();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-900">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">Sedang masuk...</h1>
          <p className="max-w-sm text-sm text-slate-600">Kami sedang memverifikasi akun Anda dan menyiapkan dashboard.</p>
        </div>

        <div className="mt-8 rounded-3xl border border-slate-100 bg-slate-50 p-6 text-center">
          {status === "loading" ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
              <p className="text-sm text-slate-700">{message}</p>
            </div>
          ) : status === "success" ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="text-sm text-slate-700">{message}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <p className="text-sm text-red-700">{message}</p>
              <button
                type="button"
                onClick={() => router.replace("/login")}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Kembali ke login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
