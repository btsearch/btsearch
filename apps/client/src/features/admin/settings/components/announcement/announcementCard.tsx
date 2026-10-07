import { Alert02Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import type { SettingsAnnouncement } from "@openbts/shared/contract";
import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsSave } from "../../hooks/useSettingsSave";
import { type AnnouncementEdits, dropSavedEdits, hasAnnouncementMessage, readAnnouncementDraft } from "../../utils/announcementDraft";
import { AnnouncementFooter } from "./announcementFooter";
import { AnnouncementMessageField } from "./announcementMessageField";
import { AnnouncementOptions } from "./announcementOptions";
import { AnnouncementPreview } from "./announcementPreview";
import { SettingsCard, SettingsCardHeader, StatusBadge } from "@/features/settings/components/settingsPrimitives";

type AnnouncementCardProps = {
  announcement: SettingsAnnouncement;
  formRef: RefObject<HTMLFormElement | null>;
};

function AnnouncementStateBadge({ isVisible }: { isVisible: boolean }) {
  const { t } = useTranslation("admin");

  if (isVisible) {
    return (
      <StatusBadge tone="success" icon={ViewIcon} className="text-emerald-700 dark:text-emerald-400">
        {t("settings.announcementForm.visible")}
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="muted" icon={ViewOffIcon}>
      {t("settings.announcementForm.hidden")}
    </StatusBadge>
  );
}

export function AnnouncementCard({ announcement, formRef }: AnnouncementCardProps) {
  const { t } = useTranslation("admin");
  const formId = useId();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [edits, setEdits] = useState<AnnouncementEdits>({});
  const save = useSettingsSave({ isOptimistic: false });

  const { draft, changes, isDirty, isMessageMissing, isMessageTooLong } = readAnnouncementDraft(announcement, edits);
  const isSaving = save.isPending;
  const canSave = isDirty && !isMessageMissing && !isMessageTooLong && !isSaving;

  function editDraft(edit: AnnouncementEdits) {
    setEdits((current) => ({ ...current, ...edit }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isMessageMissing) {
      messageRef.current?.focus();
      return;
    }
    if (canSave) save.mutate({ announcement: changes }, { onSuccess: () => setEdits((current) => dropSavedEdits(current, changes)) });
  }

  return (
    <SettingsCard>
      <SettingsCardHeader
        icon={Alert02Icon}
        title={t("settings.announcement")}
        description={t("settings.announcementForm.description")}
        badge={<AnnouncementStateBadge isVisible={announcement.isEnabled && hasAnnouncementMessage(announcement)} />}
      />
      <form ref={formRef} id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 border-t px-4 pt-4 pb-5 sm:px-5">
        <AnnouncementPreview announcement={draft} />
        <div className="flex flex-col gap-4 @4xl:flex-row @4xl:items-start @4xl:gap-6">
          <AnnouncementMessageField
            message={draft.message}
            isTooLong={isMessageTooLong}
            textareaRef={messageRef}
            onMessageChange={(message) => editDraft({ message })}
          />
          <AnnouncementOptions
            type={draft.type}
            isEnabled={draft.isEnabled}
            onTypeChange={(type) => editDraft({ type })}
            onEnabledChange={(isEnabled) => editDraft({ isEnabled })}
          />
        </div>
      </form>
      <AnnouncementFooter
        formId={formId}
        isDirty={isDirty}
        isMessageMissing={isMessageMissing}
        isSaving={isSaving}
        canSave={canSave}
        onRevert={() => setEdits({})}
      />
    </SettingsCard>
  );
}
