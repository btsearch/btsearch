import {
  Calendar03Icon,
  Facebook01Icon,
  Image01Icon,
  InstagramIcon,
  LockKeyIcon,
  Mail01Icon,
  Message01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { API_BASE, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { resolveAvatarUrl } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";

type ProfilePrivate = {
  isPrivate: true;
  id: string;
  username: string | null;
  name: string;
  image: string | null;
  createdAt: string;
};

type ProfilePublic = {
  isPrivate: false;
  id: string;
  username: string | null;
  name: string;
  image: string | null;
  bio: string | null;
  contactInfo: { instagram?: string; facebook?: string; email?: string } | null;
  profileVisibility: string;
  createdAt: string;
  comments: {
    id: string;
    content: string;
    createdAt: string;
    station: {
      id: number;
      station_id: string | null;
      operator: { id: number; name: string; mnc: number | null } | null;
    };
  }[];
};

type ProfileData = ProfilePrivate | ProfilePublic;

function ProfileSkeleton() {
  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="px-6">
        <div className="flex items-center gap-4 py-6 lg:py-4 border-b">
          <Skeleton className="size-16 rounded-full shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-36 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-3.5 w-32 rounded" />
          </div>
        </div>
        <div className="space-y-2 pt-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  );
}

function UserProfilePage() {
  const { username } = Route.useParams();
  const { t, i18n } = useTranslation("main");
  const { openStationDialog } = useFloatingDialogStack();
  const handleStationClick = useCallback((stationId: number) => openStationDialog(stationId, "internal"), [openStationDialog]);
  const { data: session } = authClient.useSession();

  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["user-profile", username],
    queryFn: () => fetchJson<{ data: ProfileData }>(`${API_BASE}/users/${username}`).then((r) => r.data),
    retry: false,
  });

  if (isLoading) return <ProfileSkeleton />;

  if (isError || !profile)
    return (
      <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <HugeiconsIcon icon={UserIcon} className="size-8 text-muted-foreground/40" />
        </div>
        <p className="text-base font-semibold text-foreground">{t("userProfile.notFoundTitle")}</p>
        <p className="text-sm text-muted-foreground mt-1">{t("userProfile.notFoundSubtitle", { username })}</p>
      </main>
    );

  const joinDate = new Date(profile.createdAt).toLocaleDateString(i18n.language, { year: "numeric", month: "long" });

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="px-6">
        <div className="py-6 lg:py-4 border-b space-y-3">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar className="size-16 shrink-0">
                <AvatarImage src={resolveAvatarUrl(profile.image)} />
                <AvatarFallback className="text-xl">{profile.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight truncate">{profile.name}</h1>
                {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 whitespace-nowrap">
                  <HugeiconsIcon icon={Calendar03Icon} className="size-3.5 shrink-0" />
                  {t("userProfile.joinedDate", { date: joinDate })}
                </p>
              </div>
            </div>

            {!profile.isPrivate && profile.contactInfo && (
              <div className="hidden sm:flex flex-wrap justify-end gap-2 shrink-0 pt-0.5">
                {profile.contactInfo.instagram && (
                  <a
                    href={`https://instagram.com/${profile.contactInfo.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-full border px-3 py-1.5 bg-background hover:bg-muted"
                  >
                    <HugeiconsIcon icon={InstagramIcon} className="size-3.5" />@{profile.contactInfo.instagram.replace(/^@/, "")}
                  </a>
                )}
                {profile.contactInfo.facebook && (
                  <a
                    href={profile.contactInfo.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-full border px-3 py-1.5 bg-background hover:bg-muted"
                  >
                    <HugeiconsIcon icon={Facebook01Icon} className="size-3.5" />
                    Facebook
                  </a>
                )}
                {profile.contactInfo.email && (
                  <a
                    href={`mailto:${profile.contactInfo.email}`}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-full border px-3 py-1.5 bg-background hover:bg-muted"
                  >
                    <HugeiconsIcon icon={Mail01Icon} className="size-3.5" />
                    {profile.contactInfo.email}
                  </a>
                )}
              </div>
            )}
          </div>

          {!profile.isPrivate && profile.bio && <p className="text-sm text-foreground/75 leading-relaxed">{profile.bio}</p>}

          {!profile.isPrivate && profile.contactInfo && (
            <div className="flex sm:hidden flex-wrap gap-2">
              {profile.contactInfo.instagram && (
                <a
                  href={`https://instagram.com/${profile.contactInfo.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-full border px-3 py-1.5 bg-background hover:bg-muted"
                >
                  <HugeiconsIcon icon={InstagramIcon} className="size-3.5" />@{profile.contactInfo.instagram.replace(/^@/, "")}
                </a>
              )}
              {profile.contactInfo.facebook && (
                <a
                  href={profile.contactInfo.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-full border px-3 py-1.5 bg-background hover:bg-muted"
                >
                  <HugeiconsIcon icon={Facebook01Icon} className="size-3.5" />
                  Facebook
                </a>
              )}
              {profile.contactInfo.email && (
                <a
                  href={`mailto:${profile.contactInfo.email}`}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-full border px-3 py-1.5 bg-background hover:bg-muted"
                >
                  <HugeiconsIcon icon={Mail01Icon} className="size-3.5" />
                  {profile.contactInfo.email}
                </a>
              )}
            </div>
          )}
        </div>

        {!profile.isPrivate && session?.user.id === profile.id && profile.profileVisibility === "private" && (
          <div className="flex items-center gap-2 mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-xs text-yellow-700 dark:text-yellow-400">
            <HugeiconsIcon icon={LockKeyIcon} className="size-3.5 shrink-0" />
            {t("userProfile.privateOwnerNotice")}
          </div>
        )}

        {profile.isPrivate ? (
          <div className="flex flex-col items-center text-center gap-3 py-16">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center">
              <HugeiconsIcon icon={LockKeyIcon} className="size-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t("userProfile.privateTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("userProfile.privateSubtitle")}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-5">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{t("userProfile.comments")}</h2>
                {profile.comments.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{profile.comments.length}</span>}
              </div>

              {profile.comments.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 flex flex-col items-center text-center gap-2">
                  <HugeiconsIcon icon={Message01Icon} className="size-7 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground">{t("userProfile.noComments")}</p>
                </div>
              ) : (
                <div className="rounded-xl border bg-card divide-y divide-border overflow-hidden">
                  {profile.comments.map((comment) => (
                    <div key={comment.id} className="px-4 py-3.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between gap-4 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="size-3 rounded-[2px] shrink-0"
                            style={{ backgroundColor: getOperatorColor(comment.station.operator?.mnc ?? -1) }}
                          />
                          <button
                            type="button"
                            onClick={() => handleStationClick(comment.station.id)}
                            className="text-xs font-medium text-muted-foreground truncate hover:text-foreground hover:underline hover:cursor-pointer transition-colors"
                          >
                            {comment.station.station_id ?? t("userProfile.stationFallback", { id: comment.station.id })}
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(comment.createdAt).toLocaleDateString(i18n.language)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/75 leading-relaxed line-clamp-2">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <h2 className="text-sm font-semibold text-foreground">{t("userProfile.photos")}</h2>
              <div className="rounded-xl border border-dashed p-10 flex flex-col items-center text-center gap-2">
                <HugeiconsIcon icon={Image01Icon} className="size-7 text-muted-foreground/25" />
                <p className="text-sm text-muted-foreground">{t("userProfile.photosSoon")}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/users/$username")({
  component: UserProfilePage,
  staticData: {
    titleKey: "userProfile.breadcrumb",
    i18nNamespace: "main",
  },
});
