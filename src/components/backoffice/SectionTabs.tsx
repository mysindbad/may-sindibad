import Link from "next/link";
import { cn } from "@/lib/utils";

export function SectionTabs({
  basePath,
  active,
  tabs,
}: {
  basePath: string;
  active: string;
  tabs: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.value === tabs[0].value ? basePath : `${basePath}?status=${tab.value}`}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
            active === tab.value ? "bg-sky-500/20 text-sky-300" : "bg-white/5 text-slate-400 hover:bg-white/10",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
