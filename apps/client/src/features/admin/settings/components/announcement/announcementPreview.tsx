import type { SettingsAnnouncement } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { hasAnnouncementMessage } from "../../utils/announcementDraft";
import { AnnouncementStrip } from "@/components/app/announcementBanner";
import { cn } from "@/lib/utils";

const PREVIEW_STRIP_CLASS = "mt-1.5 items-start rounded-lg border py-2 pr-3 pl-4 [&>svg]:mt-0.5";
const EMPTY_PREVIEW_CLASS = "text-muted-foreground dark:text-muted-foreground";
const DISABLED_PREVIEW_CLASS = "border-dashed";

export function AnnouncementPreview({ announcement }: { announcement: SettingsAnnouncement }) {
  const { t } = useTranslation("admin");
  const hasMessage = hasAnnouncementMessage(announcement);

  return (
    <div>
      <p className="text-xs leading-4 font-medium text-muted-foreground">{t("settings.announcementForm.preview")}</p>
      <AnnouncementStrip
        type={announcement.type}
        message={hasMessage ? announcement.message : t("settings.announcementForm.previewEmpty")}
        className={cn(PREVIEW_STRIP_CLASS, !hasMessage && EMPTY_PREVIEW_CLASS, !announcement.isEnabled && DISABLED_PREVIEW_CLASS)}
        messageClassName="wrap-anywhere"
      />
    </div>
  );
}
