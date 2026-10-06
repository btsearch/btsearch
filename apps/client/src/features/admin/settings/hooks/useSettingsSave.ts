import type { SettingsUpdate } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateSiteSettings } from "../api";
import { isRefusal, showSettingsError } from "../utils/errors";
import { applySettingsUpdate } from "../utils/settingsUpdate";
import { settingsQueryOptions } from "@/hooks/useSettings";

type SettingsSaveOptions = {
  isOptimistic?: boolean;
  hasInlineRefusal?: boolean;
};

const SETTINGS_SAVE_KEY = ["admin-settings", "save"] as const;
const SETTINGS_SAVE_SCOPE = "admin-settings-save";
const SAVED_TOAST_ID = "admin-settings-saved";

export function useSettingsSave({ isOptimistic = true, hasInlineRefusal = false }: SettingsSaveOptions = {}) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const settingsKey = settingsQueryOptions().queryKey;

  function isLastPendingSave(): boolean {
    return queryClient.isMutating({ mutationKey: SETTINGS_SAVE_KEY }) === 1;
  }

  function applyToCachedSettings(update: SettingsUpdate) {
    queryClient.setQueryData(settingsKey, (settings) => (settings ? applySettingsUpdate(settings, update) : settings));
  }

  return useMutation({
    mutationKey: SETTINGS_SAVE_KEY,
    scope: { id: SETTINGS_SAVE_SCOPE },
    mutationFn: updateSiteSettings,
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      if (isOptimistic) applyToCachedSettings(update);
    },
    onSuccess: async (savedSettings, update) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      if (isLastPendingSave()) queryClient.setQueryData(settingsKey, savedSettings);
      else if (!isOptimistic) applyToCachedSettings(update);
      toast.success(t("actions.saved"), { id: SAVED_TOAST_ID });
    },
    onError: (error) => {
      if (isLastPendingSave()) void queryClient.invalidateQueries({ queryKey: settingsKey });
      if (!hasInlineRefusal || !isRefusal(error)) showSettingsError(error);
    },
  });
}
