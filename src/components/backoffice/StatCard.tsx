export function StatCard({ icon, label, value, tone = "default" }: { icon: string; label: string; value: string | number; tone?: "default" | "warning" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <span aria-hidden="true">{icon}</span>
        <p className="text-xs font-medium">{label}</p>
      </div>
      <p className={"mt-2 text-2xl font-semibold " + (tone === "warning" && Number(value) > 0 ? "text-amber-400" : "text-white")}>{value}</p>
    </div>
  );
}
