"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Suspense } from "react";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Menghubungkan akun Anda...");

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") || "/";

    if (!code) {
      setStatus("error");
      setMessage("Kode otentikasi tidak ditemukan. Silakan coba lagi.");
      return;
    }

    const handleCallback = async () => {
      try {
        const response = await fetch(`/api/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
        
        let result;
        try {
          result = await response.json();
        } catch (e) {
          throw new Error("Respon server tidak valid");
        }

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Gagal menukar kode otentikasi");
        }

        setStatus("success");
        setMessage("Login berhasil! Mengarahkan Anda ke dasbor...");
        
        // Give a small delay for the user to see the success message
        setTimeout(() => {
          router.replace(result.next || next);
        }, 500);
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setStatus("error");
        setMessage(err.message || "Terjadi kesalahan saat masuk. Silakan coba lagi.");
      }
    };

    void handleCallback();
  }, [router, searchParams]);

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

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
