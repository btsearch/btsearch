import { Alert02Icon } from "@hugeicons/core-free-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { AdminUser } from "@/features/admin/users/types";
import { API_BASE, fetchJson, showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

import { SectionHeader } from "./common";

const BAN_DURATIONS = [
  { label: "1 day", value: 60 * 60 * 24 },
  { label: "7 days", value: 60 * 60 * 24 * 7 },
  { label: "30 days", value: 60 * 60 * 24 * 30 },
  { label: "Permanent", value: 0 },
] as const;

function isUploadedImage(image: string | null | undefined): boolean {
  if (!image) return false;
  return !image.startsWith("http") && image.endsWith(".webp");
}

export function DangerZoneCard({ user }: { user: AdminUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<number>(0);

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const banMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.admin.banUser({
        userId: user.id,
        ...(banReason ? { banReason } : {}),
        ...(banDuration > 0 ? { banExpiresIn: banDuration } : {}),
      });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("User banned successfully");
      setBanDialogOpen(false);
      setBanReason("");
      setBanDuration(0);
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const unbanMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.admin.unbanUser({ userId: user.id });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("User unbanned successfully");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      await fetchJson<{ data: null }>(`${API_BASE}/users/${user.id}/avatar`, { method: "DELETE" });
      const result = await authClient.admin.updateUser({ userId: user.id, data: { image: null } });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("Avatar removed successfully");
      return invalidateAll();
    },
    onError: (error) => showApiError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.admin.removeUser({ userId: user.id });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("User deleted successfully");
      void navigate({ to: "/admin/users" });
    },
    onError: (error) => showApiError(error),
  });

  return (
    <section className="pb-6">
      <SectionHeader icon={Alert02Icon} title="Danger Zone" description="Irreversible and destructive actions" />
      <Card>
        <CardContent className="space-y-4">
          {isUploadedImage(user.image) ? (
            <div className="flex items-center justify-between gap-4 py-2">
              <div>
                <p className="text-sm font-medium">Remove Avatar</p>
                <p className="text-xs text-muted-foreground">Delete the user's uploaded profile picture</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline" />}>Remove</AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove avatar?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete {user.name}'s profile picture.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => removeAvatarMutation.mutate()} disabled={removeAvatarMutation.isPending}>
                      {removeAvatarMutation.isPending ? <Spinner /> : "Remove"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <p className="text-sm font-medium">{user.banned ? "Unban User" : "Ban User"}</p>
              <p className="text-xs text-muted-foreground">
                {user.banned ? "Allow this user to sign in again" : "Prevent this user from signing in"}
              </p>
            </div>
            {user.banned ? (
              <Button variant="outline" onClick={() => unbanMutation.mutate()} disabled={unbanMutation.isPending}>
                {unbanMutation.isPending ? <Spinner /> : "Unban"}
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setBanDialogOpen(true)}>
                Ban User
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <p className="text-sm font-medium">Delete User</p>
              <p className="text-xs text-muted-foreground">Permanently remove this user and all their data</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" />}>Delete User</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the user account and all associated data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? <Spinner /> : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban {user.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ban-reason">Reason (optional)</Label>
              <Input id="ban-reason" placeholder="e.g. Spamming" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ban-duration">Duration</Label>
              <Select value={banDuration.toString()} onValueChange={(v) => setBanDuration(Number(v))}>
                <SelectTrigger id="ban-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BAN_DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value.toString()}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => banMutation.mutate()} disabled={banMutation.isPending}>
              {banMutation.isPending ? <Spinner /> : "Ban User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
