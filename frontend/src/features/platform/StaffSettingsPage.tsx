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
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { readStaffAccount, resetStaffPassword } from "./api";
import { managementMessages } from "./management-messages";
import { AccountActions, TemporaryPasswords } from "./ManagementViews";
import { useManagement } from "./useManagement";
import type { ManagedAccount } from "./state";

function StaffSettings({ owner }: { owner: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = managementMessages[language];
  const c = staffMessages[language];
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
        title={m.staffTitle}
        description={m.staffDescription(owner.restaurantName)}
        back={{ to: "/staff", label: c.home }}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={m.refreshStaff}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
        }
      />
      <div className="space-y-4">
        {query.isPending && <LoadingState label={m.loadingStaff} />}
        {query.error && (
          <Notice tone="error">{errorMessage(query.error, undefined, language)}</Notice>
        )}
        {query.data && (
          <AccountActions
            account={query.data}
            platform={false}
            language={language}
            disabled={locked || !!confirmation}
            choose={(_, a) => setConfirmation(a)}
          />
        )}
        {actions.message && <Notice>{actions.message}</Notice>}
        {actions.pending && (
          <Button disabled={actions.busy} onClick={() => void actions.recover()}>
            {m.verify}
          </Button>
        )}
        <TemporaryPasswords
          credentials={actions.secrets}
          close={actions.clearSecrets}
          language={language}
        />
      </div>
      <ConfirmDialog
        open={!!confirmation}
        title={m.resetTitle}
        description={confirmation && m.resetHint(owner.restaurantName, confirmation.username)}
        confirmLabel={m.confirmReset}
        cancelLabel={c.cancel}
        confirmDisabled={locked || changed}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmation(null)}
      >
        {changed && <Notice tone="error">{m.accountChanged}</Notice>}
      </ConfirmDialog>
    </div>
  );
}
export function StaffSettingsPage() {
  const m = managementMessages[useStaffLanguage()];
  return (
    <AuthBoundary mode="account">
      {(owner) =>
        owner.role === "OWNER" ? (
          <StaffSettings key={`${owner.restaurantId}:${owner.userId}`} owner={owner} />
        ) : (
          <Notice tone="warning">{m.ownerOnly}</Notice>
        )
      }
    </AuthBoundary>
  );
}
