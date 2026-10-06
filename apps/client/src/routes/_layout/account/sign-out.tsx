import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { removePushRegistrationOnSignOut } from "@/features/notifications/usePushSubscription";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/_layout/account/sign-out")({
  component: SignOutPage,
});

function SignOutPage() {
  const router = useRouter();

  useEffect(() => {
    void removePushRegistrationOnSignOut().then(() =>
      authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = "/";
          },
          onError: () => {
            router.history.back();
          },
        },
      }),
    );
  }, [router]);

  return null;
}
