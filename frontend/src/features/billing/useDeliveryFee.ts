import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrentAccount } from "@/features/accounts/api";
import { isSameAccount } from "@/features/accounts/queries";
import { sessionKey } from "@/features/dining/api";
import { ApiError, errorMessage, withTimeout, write } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { invalidateStoreViews } from "@/lib/store-views";
import { isLive, onLifecycleChange } from "@/lib/useLiveView";
import { useOperations } from "@/lib/useOperations";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { billingMessages } from "./messages";
import { deliveryFeeRequest, type BillSummary } from "./state";

export type FeeNotice = { tone: "success" | "warning" | "error"; text: string };

// OWNER corrects a delivery fee before closing the bill. The write carries the bill version it was read
// at, which makes a repeat harmless (BILL_CHANGED), so nothing is persisted: after an unknown result the
// bill is reread and a person decides again.
export function useDeliveryFee(account: CurrentAccount) {
  const client = useQueryClient();
  const language = useStaffLanguage();
  const m = billingMessages[language];
  const ops = useOperations();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<FeeNotice | null>(null);

  useEffect(
    () =>
      onLifecycleChange(() => {
        ops.cancelAll();
        setBusy(false);
      }),
    [ops],
  );

  function refresh(sessionId: string) {
    void client.invalidateQueries({ queryKey: sessionKey(account, sessionId) });
    invalidateStoreViews(client, account, ["billing", "online-active"]);
  }

  async function save(bill: BillSummary, deliveryFeeCents: number) {
    if (!isLive() || !isSameAccount(client, account)) return false;
    const op = ops.start(bill.sessionId);
    if (!op) return false;
    const current = () => op.isCurrent() && isSameAccount(client, account);
    setBusy(true);
    setNotice(null);
    const intent = deliveryFeeRequest(bill, deliveryFeeCents);
    try {
      const summary = await write<BillSummary>(
        intent.path,
        "PATCH",
        intent.body,
        withTimeout(op.signal),
      );
      if (!current()) return false;
      await client.cancelQueries({ queryKey: sessionKey(account, bill.sessionId) });
      if (!current()) return false;
      client.setQueryData(sessionKey(account, bill.sessionId), summary);
      setNotice({
        tone: "success",
        text: m.online.feeSaved(
          formatMoney(summary.deliveryFeeCents ?? 0, language),
          formatMoney(summary.totalAmountCents, language),
        ),
      });
      return true;
    } catch (e) {
      if (!current()) return false;
      setNotice(
        e instanceof ApiError && e.status < 500
          ? { tone: "error", text: errorMessage(e, undefined, language) }
          : { tone: "warning", text: m.online.feeUnknown },
      );
      return false;
    } finally {
      if (op.finish()) setBusy(false);
      // Success, a rejection and an unknown result all reread the bill.
      if (current()) refresh(bill.sessionId);
    }
  }

  return { busy, notice, save, clearNotice: () => setNotice(null) };
}
