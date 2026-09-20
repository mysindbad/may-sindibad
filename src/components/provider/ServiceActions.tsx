"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Input, Label } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";
import { buildLoginPath } from "@/lib/auth/return-path";

// Services used to be write-once: POST /api/provider-services created them and
// nothing could ever change or retire one. These actions drive the PATCH and
// DELETE (soft-delete) endpoints added alongside this component.
export function ServiceActions({
  service,
}: {
  service: { id: string; name: string; priceAmount: string | null; isActive: boolean };
}) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [priceAmount, setPriceAmount] = useState<number | "">(service.priceAmount === null ? "" : Number(service.priceAmount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/provider-services/" + service.id, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) {
        router.push(buildLoginPath(locale, "/" + locale + "/provider"));
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await send("PATCH", { name, priceAmount: priceAmount === "" ? undefined : Number(priceAmount) });
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="mt-3 space-y-3 border-t border-slate-200 pt-3">
        <div>
          <Label htmlFor={"service-name-" + service.id}>{dict.marketplace.serviceName}</Label>
          <Input
            id={"service-name-" + service.id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor={"service-price-" + service.id}>{dict.marketplace.priceUsd}</Label>
          <Input
            id={"service-price-" + service.id}
            type="number"
            min={0}
            value={priceAmount}
            onChange={(e) => setPriceAmount(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={busy}>
            {dict.common.save}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            {dict.common.cancel}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
          {dict.providerTools.editService}
        </Button>
        {service.isActive ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (window.confirm(dict.providerTools.deactivateConfirm)) void send("DELETE");
            }}
          >
            {dict.providerTools.deactivateService}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send("PATCH", { isActive: true })}>
            {dict.providerTools.activate}
          </Button>
        )}
      </div>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
    </div>
  );
}
