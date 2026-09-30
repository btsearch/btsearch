import i18next from "i18next";
import { type ReactNode, createContext, useContext, useState } from "react";
import { toast } from "sonner";

import { isFreshSessionError, showSettingsError } from "./authErrors";
import { AuthDialog } from "@/components/auth/authDialog";

const ReauthContext = createContext<() => void>(() => {});

export function ReauthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const requestReauth = () => setOpen(true);

  return (
    <ReauthContext.Provider value={requestReauth}>
      {children}
      <AuthDialog open={open} onOpenChange={setOpen} />
    </ReauthContext.Provider>
  );
}

export function useRequestReauth() {
  return useContext(ReauthContext);
}

export function useSettingsErrorHandler() {
  const requestReauth = useRequestReauth();

  return (error: unknown) => {
    if (isFreshSessionError(error)) {
      toast.error(i18next.t("settings:security.freshSessionRequired"), {
        action: { label: i18next.t("settings:sessions.freshAction"), onClick: () => requestReauth() },
      });
      return;
    }
    showSettingsError(error);
  };
}
