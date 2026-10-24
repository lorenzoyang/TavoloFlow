import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { formatCents, formatMoney, parsePrice } from "@/lib/format";
import { randomUuid } from "@/lib/ids";
import { onLifecycleChange } from "@/lib/useLiveView";
import {
  adjustExpiry,
  confirmPayment,
  createPeriod,
  editPeriod,
  getSubscription,
  platformSubscriptionKey,
  saveSubscription,
} from "./api";
import { PeriodFields } from "./PeriodFields";
import { useSubscriptionQuery } from "./queries";
import {
  periodFromForm,
  renewalStart,
  type SubscriptionPeriod,
  type SubscriptionSummary,
} from "./state";
import { PeriodDetails, SubscriptionStatus } from "./SubscriptionViews";
import { useSubscriptionActions } from "./useSubscriptionActions";

type Editor = {
  kind: "metadata" | "create" | "edit" | "expiry" | "payment";
  summary: SubscriptionSummary;
  period?: SubscriptionPeriod;
};
type Confirmation = {
  version: number;
  description: string;
  send: (signal: AbortSignal) => Promise<unknown>;
};

export function PlatformSubscription({
  userId,
  restaurantId,
}: {
  userId: string;
  restaurantId: string;
}) {
  const detail = useSubscriptionQuery(platformSubscriptionKey(userId, restaurantId), (signal) =>
    getSubscription(restaurantId, signal),
  );
  const summary = detail.data?.summary;
  const periods = detail.data?.periods;
  const actions = useSubscriptionActions(userId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [validation, setValidation] = useState("");
  useEffect(() => onLifecycleChange(() => setConfirmation(null)), []);
  // Background refreshes block submission but never disable inputs that are being typed into.
  const locked = actions.busy || detail.stale || detail.isFetching || !summary;
  const open = (kind: Editor["kind"], period?: SubscriptionPeriod) => {
    if (!summary || locked) return;
    setValidation("");
    setConfirmation(null);
    setEditor({ kind, period, summary });
  };
  const submitEditor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || locked) return;
    const data = new FormData(event.currentTarget);
    const expectedVersion = editor.summary.version;
    try {
      let next: Confirmation;
      if (editor.kind === "metadata") {
        const raw = String(data.get("annualFee") ?? "").trim();
        const annualFee = raw ? parsePrice(raw, true) : null;
        if (raw && annualFee === null) throw new Error("请填写最多两位小数的有效年费。");
        const ownerContact = String(data.get("ownerContact") ?? "").trim() || null;
        next = {
          version: expectedVersion,
          description: `保存联系方式及下次新建周期的默认年费：${annualFee === null ? "未设置" : formatMoney(annualFee)}。已有周期约定保持原值。`,
          send: (signal) =>
            saveSubscription(
              restaurantId,
              { expectedVersion, ownerContact, defaultAnnualFeeCents: annualFee },
              signal,
            ),
        };
      } else if (editor.kind === "create" || editor.kind === "edit") {
        const period = periodFromForm(data, "period", editor.period?.id ?? randomUuid());
        next = {
          version: expectedVersion,
          description: `${editor.kind === "create" ? "登记" : "修改"} ${period.startsOn} 至 ${period.endsOn}，${period.years} 年，整个周期总金额 ${formatMoney(period.amountCents)}。${period.paidOn ? `已收全款，付费日期 ${period.paidOn}。` : "未付费。"}`,
          send: (signal) =>
            editor.kind === "create"
              ? createPeriod(restaurantId, { ...period, expectedVersion }, signal)
              : editPeriod(
                  restaurantId,
                  period.id,
                  {
                    startsOn: period.startsOn,
                    endsOn: period.endsOn,
                    years: period.years,
                    amountCents: period.amountCents,
                    expectedVersion,
                  },
                  signal,
                ),
        };
      } else if (editor.kind === "expiry") {
        const endsOn = String(data.get("endsOn"));
        if (!endsOn || endsOn <= editor.period!.startsOn)
          throw new Error("截止日期必须晚于开始日期。");
        next = {
          version: expectedVersion,
          description: `把截止日期从 ${editor.period!.endsOn} 调整到 ${endsOn}。本次只调整期限，不登记收款。`,
          send: (signal) =>
            adjustExpiry(restaurantId, editor.period!.id, { expectedVersion, endsOn }, signal),
        };
      } else {
        const paidOn = String(data.get("paidOn"));
        if (!paidOn || paidOn > editor.summary.localToday)
          throw new Error("请填写不晚于今天的实际付费日期。");
        next = {
          version: expectedVersion,
          description: `确认已收到 ${editor.period!.startsOn} 至 ${editor.period!.endsOn} 的全部费用 ${formatMoney(editor.period!.amountCents)}，实际付费日期 ${paidOn}。服务起止日期保持原约定。`,
          send: (signal) =>
            confirmPayment(restaurantId, editor.period!.id, { expectedVersion, paidOn }, signal),
        };
      }
      setValidation("");
      setConfirmation(next);
    } catch (error) {
      setValidation(error instanceof Error ? error.message : "请核对输入。");
    }
  };
  const commit = async () => {
    if (!confirmation || locked || confirmation.version !== summary?.version) return;
    const selected = confirmation;
    setConfirmation(null);
    if (await actions.run(selected.send)) setEditor(null);
  };
  return (
    <section className="my-6 space-y-5 rounded-xl border bg-card p-5" aria-label="餐厅年费管理">
      <h2 className="text-xl font-semibold">年费与收费周期</h2>
      {detail.isPending && <p role="status">正在读取年费资料…</p>}
      {detail.error && <p role="alert">{errorMessage(detail.error)}</p>}
      {summary && (
        <>
          <SubscriptionStatus summary={summary} />
          <p className="whitespace-pre-wrap wrap-break-word">
            老板联系方式：{summary.ownerContact || "尚未登记"}
          </p>
          <p>
            下次新建周期的默认年费：
            {summary.defaultAnnualFeeCents === null
              ? "尚未设置"
              : formatMoney(summary.defaultAnnualFeeCents)}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={locked}
              onClick={() => open("metadata")}
            >
              编辑联系方式与年费
            </Button>
            <Button className="min-h-11" disabled={locked} onClick={() => open("create")}>
              登记新收费周期
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => void detail.refetch()}>
              刷新年费资料
            </Button>
          </div>
          {detail.stale && <p role="status">当前资料待刷新；读取成功后可继续修改。</p>}
        </>
      )}
      {actions.message && <p role="status">{actions.message}</p>}
      {editor && (
        <form
          key={`${editor.kind}:${editor.period?.id ?? "new"}:${editor.summary.version}`}
          onSubmit={submitEditor}
          className="space-y-4 rounded-lg border p-4"
        >
          <h3 className="font-semibold">
            {
              {
                metadata: "联系方式与默认年费",
                create: "登记新收费周期",
                edit: "修改未付款周期",
                expiry: "单独调整截止日期",
                payment: "登记收到全款",
              }[editor.kind]
            }
          </h3>
          <fieldset disabled={actions.busy || !!confirmation} className="grid gap-4 sm:grid-cols-2">
            {editor.kind === "metadata" ? (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="subscription-contact">老板联系方式</Label>
                  <textarea
                    id="subscription-contact"
                    name="ownerContact"
                    maxLength={500}
                    defaultValue={editor.summary.ownerContact ?? ""}
                    rows={3}
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="subscription-annual">下次新建周期的默认年费（EUR，可留空）</Label>
                  <Input
                    id="subscription-annual"
                    name="annualFee"
                    inputMode="decimal"
                    defaultValue={
                      editor.summary.defaultAnnualFeeCents === null
                        ? ""
                        : formatCents(editor.summary.defaultAnnualFeeCents)
                    }
                    className="h-11"
                  />
                </div>
              </>
            ) : editor.kind === "create" || editor.kind === "edit" ? (
              <PeriodFields
                key={`${editor.kind}:${editor.period?.id ?? "new"}`}
                prefix="period"
                annualFee={editor.summary.defaultAnnualFeeCents}
                today={editor.summary.localToday}
                startsOn={renewalStart(periods?.[0], editor.summary)}
                initial={editor.period}
                allowPaid={editor.kind === "create"}
              />
            ) : editor.kind === "expiry" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="subscription-end">新的截止日期</Label>
                <Input
                  id="subscription-end"
                  name="endsOn"
                  type="date"
                  required
                  defaultValue={editor.period!.endsOn}
                  min={editor.period!.startsOn}
                  className="h-11"
                />
              </div>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <PeriodDetails period={editor.period!} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="subscription-paid">实际付费日期</Label>
                  <Input
                    id="subscription-paid"
                    name="paidOn"
                    type="date"
                    required
                    defaultValue={editor.summary.localToday}
                    max={editor.summary.localToday}
                    className="h-11"
                  />
                </div>
              </>
            )}
            <Button type="submit" className="min-h-11" disabled={locked}>
              核对并继续
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setEditor(null);
                setValidation("");
              }}
            >
              取消编辑
            </Button>
          </fieldset>
          {editor.summary.version !== summary?.version && (
            <p role="alert">资料已被更新，请关闭编辑后重新核对最新资料。</p>
          )}
          {validation && <p role="alert">{validation}</p>}
        </form>
      )}
      {confirmation && (
        <section className="space-y-4 rounded-lg border p-4" aria-label="收费操作确认">
          <h3 className="font-semibold">确认本次操作</h3>
          <p>{confirmation.description}</p>
          {confirmation.version !== summary?.version && (
            <p role="alert">资料版本已变化，请取消后重新读取。</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-11"
              disabled={locked || confirmation.version !== summary?.version}
              onClick={() => void commit()}
            >
              确认执行
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => setConfirmation(null)}>
              返回修改
            </Button>
          </div>
        </section>
      )}
      <h3 className="font-semibold">收费周期与付款历史</h3>
      {periods?.length === 0 && <p>尚未登记收费周期。</p>}
      {periods?.map((period) => (
        <article className="space-y-3 rounded-lg border p-4" key={period.id}>
          <PeriodDetails period={period} />
          <div className="flex flex-wrap gap-3">
            {!period.paidOn && (
              <>
                <Button
                  className="min-h-11"
                  disabled={locked}
                  onClick={() => open("payment", period)}
                >
                  确认收到全款
                </Button>
                <Button
                  className="min-h-11"
                  variant="outline"
                  disabled={locked}
                  onClick={() => open("edit", period)}
                >
                  修改约定
                </Button>
              </>
            )}
            <Button
              className="min-h-11"
              variant="outline"
              disabled={locked}
              onClick={() => open("expiry", period)}
            >
              单独调整期限
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
