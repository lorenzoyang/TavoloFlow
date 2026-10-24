import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { readStaffAccount, resetStaffPassword } from "./api";
import { AccountActions, TemporaryPasswords } from "./ManagementViews";
import { useManagement } from "./useManagement";
import type { ManagedAccount } from "./state";

function StaffSettings({ owner }: { owner: CurrentAccount }) {
  const query = useQuery({
    queryKey: ["staff-account", owner.restaurantId, owner.userId],
    queryFn: ({ signal }) => readStaffAccount(signal),
  });
  const actions = useManagement("store", owner.userId, owner.restaurantId);
  const [confirmation, setConfirmation] = useState<ManagedAccount | null>(null);
  const locked =
    actions.busy || !!actions.pending || actions.damaged || query.isError || query.isFetching;
  const changed =
    !!confirmation && confirmation.credentialVersion !== query.data?.credentialVersion;
  const submit = async () => {
    if (!confirmation || locked || confirmation.credentialVersion !== query.data?.credentialVersion)
      return;
    setConfirmation(null);
    const version = confirmation.credentialVersion;
    await actions.run(
      {
        kind: "reset",
        restaurantId: owner.restaurantId,
        userId: confirmation.id,
        expectedVersion: version,
      },
      (signal) => resetStaffPassword(version, signal),
    );
  };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="员工账号"
        description={`${owner.restaurantName} · 店里所有员工设备共用这个 STAFF 账号。`}
        back={{ to: "/staff", label: "首页" }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label="刷新员工账号"
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="space-y-4">
        {query.isPending && <LoadingState label="正在读取员工账号…" />}
        {query.error && <Notice tone="error">{errorMessage(query.error)}</Notice>}
        {query.data && (
          <AccountActions
            account={query.data}
            platform={false}
            disabled={locked || !!confirmation}
            choose={(_, a) => setConfirmation(a)}
          />
        )}
        {actions.message && <Notice>{actions.message}</Notice>}
        {actions.pending && (
          <Button disabled={actions.busy} onClick={() => void actions.recover()}>
            查询原操作结果
          </Button>
        )}
        <TemporaryPasswords credentials={actions.secrets} close={actions.clearSecrets} />
      </div>
      <ConfirmDialog
        open={!!confirmation}
        title="确认重置员工密码"
        description={
          confirmation &&
          `${owner.restaurantName} · ${confirmation.username}：重置后所有员工设备须重新登录，并修改临时密码。`
        }
        confirmLabel="确认重置"
        confirmDisabled={locked || changed}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmation(null)}
      >
        {changed && <Notice tone="error">账号已变化，请取消后重新核对。</Notice>}
      </ConfirmDialog>
    </div>
  );
}
export function StaffSettingsPage() {
  return (
    <AuthBoundary mode="account">
      {(owner) =>
        owner.role === "OWNER" ? (
          <StaffSettings key={`${owner.restaurantId}:${owner.userId}`} owner={owner} />
        ) : (
          <Notice tone="warning">仅老板可以管理员工密码。</Notice>
        )
      }
    </AuthBoundary>
  );
}
