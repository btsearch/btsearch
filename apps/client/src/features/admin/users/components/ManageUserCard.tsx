import { SecurityLockIcon } from "@hugeicons/core-free-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AdminUser } from "@/features/admin/users/types";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

import { SectionHeader } from "./common";

const ROLES = ["user", "editor", "admin"] as const;
const NO_LINKS_RE = /https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}/i;

function ForceTotpDescription({ hasPassword, twoFactorEnabled }: { hasPassword?: boolean; twoFactorEnabled?: boolean }) {
  if (!hasPassword) return "Cannot force 2FA - user has no password set. Set a password first.";
  if (twoFactorEnabled) return "User must keep 2FA active - they'll be blocked if it's ever disabled.";
  return "User does not have 2FA enabled yet.";
}

export function ManageUserCard({ user, hasPassword }: { user: AdminUser; hasPassword?: boolean }) {
  const queryClient = useQueryClient();
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin"] });
  const bioHasLink = NO_LINKS_RE.test(editBio);

  const setRoleMutation = useMutation({
    mutationFn: async (newRole: string) => {
      const result = await authClient.admin.setRole({ userId: user.id, role: newRole as "user" | "admin" });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Role updated successfully");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const updateNameMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.admin.updateUser({ userId: user.id, data: { name: editName.trim() } });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Name updated successfully");
      setEditName("");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const updateUsernameMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.admin.updateUser({
        userId: user.id,
        data: { username: editUsername.trim() } as Record<string, unknown>,
      });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Username updated successfully");
      setEditUsername("");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const updateBioMutation = useMutation({
    mutationFn: async (value: string | null) => {
      const result = await authClient.admin.updateUser({
        userId: user.id,
        data: { bio: value } as Record<string, unknown>,
      });
      if (result.error) throw result.error;
    },
    onSuccess: (_data, value) => {
      toast.success(value === null ? "Bio cleared" : "Bio updated successfully");
      setEditBio("");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const setPasswordMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.admin.setUserPassword({ userId: user.id, newPassword });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Password updated successfully");
      setNewPassword("");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const forceTotpMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const result = await authClient.admin.updateUser({ userId: user.id, data: { forceTotp: enabled } as Record<string, unknown> });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Force 2FA setting updated");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  return (
    <section>
      <SectionHeader icon={SecurityLockIcon} title="Manage User" description="Update user details, role, and password" />
      <Card>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Role</Label>
            <div className="flex items-center gap-2">
              <Select value={user.role ?? "user"} onValueChange={(v) => setRoleMutation.mutate(v as string)} disabled={setRoleMutation.isPending}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {setRoleMutation.isPending && <Spinner />}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Update Name</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder={user.name}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="max-w-xs"
                autoComplete="name"
              />
              <Button onClick={() => updateNameMutation.mutate()} disabled={updateNameMutation.isPending || !editName.trim()}>
                {updateNameMutation.isPending ? <Spinner /> : "Update"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Update Username</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder={user.username ?? "No username"}
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="max-w-xs"
                autoComplete="username"
              />
              <Button onClick={() => updateUsernameMutation.mutate()} disabled={updateUsernameMutation.isPending || !editUsername.trim()}>
                {updateUsernameMutation.isPending ? <Spinner /> : "Update"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bio</Label>
            <Textarea
              placeholder={user.bio ?? "No bio set"}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              maxLength={500}
              rows={3}
              className={cn("max-w-sm resize-none", bioHasLink && "border-destructive focus-visible:ring-destructive")}
            />
            {bioHasLink && <p className="text-xs text-destructive">Bio cannot contain links</p>}
            <p className="text-xs text-muted-foreground">{editBio.length}/500</p>
            <div className="flex gap-2">
              <Button
                onClick={() => updateBioMutation.mutate(editBio.trim())}
                disabled={updateBioMutation.isPending || !editBio.trim() || bioHasLink}
              >
                {updateBioMutation.isPending ? <Spinner /> : "Update Bio"}
              </Button>
              {user.bio && (
                <Button variant="outline" onClick={() => updateBioMutation.mutate(null)} disabled={updateBioMutation.isPending}>
                  {updateBioMutation.isPending ? <Spinner /> : "Clear Bio"}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Set Password</Label>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="max-w-xs"
                autoComplete="new-password"
              />
              <Button onClick={() => setPasswordMutation.mutate()} disabled={setPasswordMutation.isPending || !newPassword}>
                {setPasswordMutation.isPending ? <Spinner /> : "Set Password"}
              </Button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label>Force 2FA</Label>
              <p className="text-xs text-muted-foreground">
                <ForceTotpDescription hasPassword={hasPassword} twoFactorEnabled={user.twoFactorEnabled} />
              </p>
            </div>
            <Switch
              checked={!!user.forceTotp}
              onCheckedChange={(checked) => forceTotpMutation.mutate(checked)}
              disabled={forceTotpMutation.isPending || !hasPassword}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
