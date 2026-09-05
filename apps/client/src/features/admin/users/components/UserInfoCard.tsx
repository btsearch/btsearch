import { Cancel01Icon, CheckmarkCircle02Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { AdminUser } from "@/features/admin/users/types";
import { fetchApiData, showApiError } from "@/lib/api";
import { useResendCooldown } from "@/lib/auth/use-resend-cooldown";

import { InfoRow, SectionHeader } from "./common";

function getResendButtonLabel(isPending: boolean, isCoolingDown: boolean, cooldown: number): string {
  if (isPending) return "Sending...";
  if (isCoolingDown) return `Resend in ${cooldown}s`;
  return "Resend verification";
}

export function UserInfoCard({ user }: { user: AdminUser }) {
  const { cooldown, isCoolingDown, startCooldown } = useResendCooldown();
  const resendVerificationMutation = useMutation({
    mutationFn: () =>
      fetchApiData<null>(`admin/users/${encodeURIComponent(user.id)}/resend-verification`, {
        method: "POST",
      }),
    onSuccess: () => {
      startCooldown();
      toast.success(`Verification email sent to ${user.email}`);
    },
    onError: showApiError,
  });
  const isResending = resendVerificationMutation.isPending;

  return (
    <section>
      <SectionHeader icon={UserIcon} title="User Information" description="Basic details about this user" />
      <Card>
        <CardContent className="divide-y">
          <InfoRow label="Name">{user.name}</InfoRow>
          <InfoRow label="Email">{user.email}</InfoRow>
          <InfoRow label="Email Verified">
            {user.emailVerified ? (
              <span className="flex items-center gap-1 text-green-600">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
                Verified
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                  Not verified
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isResending || isCoolingDown}
                  onClick={() => resendVerificationMutation.mutate()}
                >
                  {isResending ? <Spinner /> : null}
                  {getResendButtonLabel(isResending, isCoolingDown, cooldown)}
                </Button>
              </span>
            )}
          </InfoRow>
          {user.username && <InfoRow label="Username">@{user.username}</InfoRow>}
          <InfoRow label="Bio">
            {user.bio ? <span className="whitespace-pre-wrap">{user.bio}</span> : <span className="text-muted-foreground italic">No bio set</span>}
          </InfoRow>
          <InfoRow label="Role">{user.role ?? "user"}</InfoRow>
          <InfoRow label="Created">{new Date(user.createdAt).toLocaleString()}</InfoRow>
          {user.banned && (
            <>
              <InfoRow label="Ban Status">
                <Badge variant="destructive">Banned</Badge>
              </InfoRow>
              {user.banReason && <InfoRow label="Ban Reason">{user.banReason}</InfoRow>}
              {user.banExpires && <InfoRow label="Ban Expires">{new Date(user.banExpires).toLocaleString()}</InfoRow>}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
