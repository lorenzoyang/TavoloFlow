import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AuthBoundary } from "@/features/accounts/AuthBoundary";
import type { CurrentAccount } from "@/features/accounts/api";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { errorMessage } from "@/lib/api";
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
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold">店铺账号设置 · {owner.restaurantName}</h1>
      <Link to="/staff" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>
        返回账号页
      </Link>
      <Button className="ml-3 min-h-11" variant="outline" onClick={() => void query.refetch()}>
        刷新员工账号
      </Button>
      {query.isPending && <p role="status">正在读取员工账号…</p>}
      {query.error && <p role="alert">{errorMessage(query.error)}</p>}
      {query.data && (
        <AccountActions
          account={query.data}
          platform={false}
          disabled={locked || !!confirmation}
          choose={(_, a) => setConfirmation(a)}
        />
      )}
      {confirmation && (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">确认重置员工密码</h2>
          <p>
            {owner.restaurantName} · {confirmation.username}
            ：重置后所有员工设备须重新登录，并修改临时密码。
          </p>
          {confirmation.credentialVersion !== query.data?.credentialVersion && (
            <p role="alert">账号已变化，请取消后重新核对。</p>
          )}
          <Button
            className="min-h-11"
            disabled={locked || confirmation.credentialVersion !== query.data?.credentialVersion}
            onClick={() => void submit()}
          >
            确认重置
          </Button>
          <Button className="ml-3 min-h-11" variant="outline" onClick={() => setConfirmation(null)}>
            取消
          </Button>
        </section>
      )}
      {actions.message && <p role="status">{actions.message}</p>}
      {actions.pending && (
        <Button disabled={actions.busy} onClick={() => void actions.recover()}>
          查询原操作结果
        </Button>
      )}
      <TemporaryPasswords credentials={actions.secrets} close={actions.clearSecrets} />
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
          <p role="alert">仅老板可以管理员工密码。</p>
        )
      }
    </AuthBoundary>
  );
}
