import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-900">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">Login gagal</h1>
        <p className="mt-3 text-sm text-slate-600">
          Kami tidak dapat menyelesaikan proses otentikasi. Silakan coba lagi atau hubungi tim dukungan jika masalah berlanjut.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Kembali ke login
        </Link>
      </div>
    </div>
  );
}
