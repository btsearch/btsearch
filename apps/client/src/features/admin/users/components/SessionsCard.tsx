import { ComputerIcon } from "@hugeicons/core-free-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { Session } from "@/features/admin/users/types";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

import { SectionHeader } from "./common";

export function SessionsCard({ userId, sessions }: { userId: string; sessions: Session[] }) {
  const queryClient = useQueryClient();
  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionToken: string) => {
      const result = await authClient.admin.revokeUserSession({ sessionToken });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Session revoked");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.admin.revokeUserSessions({ userId });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("All sessions revoked");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  return (
    <section>
      <SectionHeader icon={ComputerIcon} title="Sessions" description="Active sessions for this user" />
      <Card>
        <CardContent>
          {sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="destructive" size="sm" onClick={() => revokeAllMutation.mutate()} disabled={revokeAllMutation.isPending}>
                  {revokeAllMutation.isPending ? <Spinner /> : "Revoke All"}
                </Button>
              </div>
              <div className="divide-y">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-mono truncate">{session.token.slice(0, 20)}...</div>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(session.createdAt).toLocaleString()}
                        {session.ipAddress && ` · ${session.ipAddress}`}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeSessionMutation.mutate(session.token)}
                      disabled={revokeSessionMutation.isPending && revokeSessionMutation.variables === session.token}
                    >
                      {revokeSessionMutation.isPending && revokeSessionMutation.variables === session.token ? <Spinner /> : "Revoke"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">No active sessions</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
