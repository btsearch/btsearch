import { useState } from "react";

import { authClient } from "@/lib/auth/client";

export function useSettledSession(): ReturnType<typeof authClient.useSession> {
  const session = authClient.useSession();
  const [settled, setSettled] = useState(!session.isPending);
  if (!settled && !session.isPending) setSettled(true);

  return settled && session.isPending ? { ...session, isPending: false } : session;
}
