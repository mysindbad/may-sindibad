"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ControlRoomLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.code === "invalid_credentials" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : (data.error ?? "حدث خطأ ما."));
        return;
      }

      if (data.user?.role !== "admin") {
        setError("هذا الحساب لا يملك صلاحية الدخول للوحة الإدارة.");
        return;
      }

      router.push("/control-room");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-violet-700 via-fuchsia-600 to-fuchsia-500 text-3xl shadow-[0_8px_30px_-6px_rgba(192,38,211,0.5)]">
            🛡️
          </span>
          <div>
            <h1 className="text-lg font-semibold text-white">لوحة الإدارة</h1>
            <p className="text-sm text-slate-400">مركز عمليات ماي سندباد</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
          <div className="space-y-1.5">
            <label htmlFor="control-room-email" className="text-xs font-medium text-slate-400">
              البريد الإلكتروني
            </label>
            <input
              id="control-room-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="control-room-password" className="text-xs font-medium text-slate-400">
              كلمة المرور
            </label>
            <input
              id="control-room-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-br from-violet-700 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {busy ? "جارٍ الدخول…" : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </div>
  );
}
