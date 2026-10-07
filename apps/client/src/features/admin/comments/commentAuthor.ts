import type { Comment } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { getPickerUserName } from "@/features/admin/users/picker/pickerUser";

export function useCommentAuthorName(author: Comment["author"]): string {
  const { t } = useTranslation("stationDetails");
  return getPickerUserName(author) ?? t("stationDetails:comments.unknownAuthor");
}
