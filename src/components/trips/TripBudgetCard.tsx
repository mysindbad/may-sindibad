import { Badge, Card } from "@/components/ui/primitives";
import { formatCurrency } from "@/lib/utils";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { TripBudgetSummary } from "@/lib/trips/actions";

// The budget reads from the itinerary itself, so adding or removing an
// activity moves this card without anyone re-entering a number.
export function TripBudgetCard({
  summary,
  dict,
  locale,
}: {
  summary: TripBudgetSummary;
  dict: Dictionary;
  locale: string;
}) {
  const hasBudget = summary.budgetAmount !== null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-brand-950">{dict.tripBudget.title}</p>
        {summary.overBudget && <Badge tone="danger">{dict.tripBudget.over}</Badge>}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-slate-500">{dict.tripBudget.planned}</p>
          <p className="text-lg font-semibold text-brand-950">
            {formatCurrency(summary.estimatedTotal, summary.currency, locale)}
          </p>
        </div>

        {hasBudget ? (
          <>
            <div>
              <p className="text-xs text-slate-500">{dict.tripBudget.budget}</p>
              <p className="text-lg font-semibold text-brand-950">
                {formatCurrency(summary.budgetAmount ?? 0, summary.currency, locale)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{dict.tripBudget.remaining}</p>
              <p className={summary.overBudget ? "text-lg font-semibold text-red-600" : "text-lg font-semibold text-turquoise-500"}>
                {formatCurrency(summary.remaining ?? 0, summary.currency, locale)}
              </p>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">{dict.tripBudget.noBudget}</p>
        )}
      </div>

      {hasBudget && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={summary.overBudget ? "h-full rounded-full bg-red-500" : "h-full rounded-full bg-turquoise-500"}
            style={{
              width:
                Math.min(100, Math.round((summary.estimatedTotal / Math.max(1, summary.budgetAmount ?? 1)) * 100)) + "%",
            }}
          />
        </div>
      )}

      {/* Unpriced activities are surfaced, never folded into the total as zero. */}
      {summary.unestimatedItems > 0 && (
        <p className="text-xs text-slate-500">
          {dict.tripBudget.unpriced}: {summary.unestimatedItems}
        </p>
      )}
      <p className="text-xs text-slate-400">{dict.tripBudget.estimateNote}</p>
    </Card>
  );
}
