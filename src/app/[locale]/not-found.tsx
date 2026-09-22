export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <span className="text-4xl">🧭</span>
      <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">We couldn&apos;t find that page</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">It may have moved, or the link might be out of date.</p>
    </div>
  );
}
