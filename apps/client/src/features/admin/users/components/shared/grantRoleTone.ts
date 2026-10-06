import { UserShield01Icon } from "@hugeicons/core-free-icons";

import { ROLE_TONES } from "@/components/app/roleTone";

export const GRANT_ROLE_TONES = {
  editor: { icon: ROLE_TONES.editor.icon, badge: ROLE_TONES.editor.badge },
  maintainer: { icon: UserShield01Icon, badge: ROLE_TONES.editor.badge },
} as const;
