import { Login01Icon, UserLock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MapLinkButton } from "@/components/app/errorScreens";
import { AuthDialog } from "@/components/auth/authDialog";
import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/ui/error-state";

type AuthRequiredProps = {
  showMapLink?: boolean;
};

export function AuthRequired({ showMapLink = true }: AuthRequiredProps) {
  const { t } = useTranslation("common");
  const [isDialogOpen, setIsDialogOpen] = useState(true);

  return (
    <>
      <PageErrorState
        tone="neutral"
        icon={UserLock01Icon}
        title={t("errorPage.signInRequired.title")}
        description={t("errorPage.signInRequired.description")}
        signal="noService"
        action={
          <>
            <Button type="button" onClick={() => setIsDialogOpen(true)}>
              <HugeiconsIcon icon={Login01Icon} data-icon="inline-start" aria-hidden="true" />
              {t("errorPage.signInRequired.signIn")}
            </Button>
            {showMapLink ? <MapLinkButton variant="outline" /> : null}
          </>
        }
      />
      <AuthDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
