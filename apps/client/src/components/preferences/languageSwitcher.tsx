import { LanguageSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { type SupportedLanguage, ensureLanguageResources, persistLanguage, supportedLanguages } from "@/i18n/config";
import { authClient } from "@/lib/auth/client";

export const preloadEnglishCatalog = () => void ensureLanguageResources("en-US");

export function useLanguageChange() {
  const { i18n } = useTranslation();
  const { data: session } = authClient.useSession();
  const isSignedIn = Boolean(session?.user);

  return (code: SupportedLanguage) => {
    void ensureLanguageResources(code).then(() => i18n.changeLanguage(code));
    persistLanguage(code);
    if (isSignedIn) void authClient.updateUser({ locale: code });
  };
}

export function useLanguageOptions() {
  const { i18n } = useTranslation();
  const displayNames = new Intl.DisplayNames([i18n.language], { type: "language" });
  const options = supportedLanguages.map((language) => {
    const hint = displayNames.of(new Intl.Locale(language.code).language);
    const showHint = hint !== undefined && hint.toLocaleLowerCase() !== language.nativeName.toLocaleLowerCase();
    return { code: language.code, nativeName: language.nativeName, hint: showHint ? hint : null };
  });
  const current = options.find((option) => option.code === i18n.language) ?? options.find((option) => option.code === "pl-PL");

  return { options, current };
}

export function LanguageMenuItems({ onSelect }: { onSelect?: () => void }) {
  const changeLanguage = useLanguageChange();
  const { options, current } = useLanguageOptions();

  return (
    <DropdownMenuRadioGroup
      value={current?.code}
      onValueChange={(code) => {
        changeLanguage(code);
        onSelect?.();
      }}
    >
      {options.map((option) => (
        <DropdownMenuRadioItem
          key={option.code}
          value={option.code}
          closeOnClick={!onSelect}
          className="h-8 cursor-pointer gap-2 pl-2 focus:bg-muted pointer-coarse:h-11 pointer-coarse:pl-3"
        >
          <span lang={option.code}>{option.nativeName}</span>
          {option.hint ? <span className="text-xs text-muted-foreground">{option.hint}</span> : null}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function LanguageSwitcher() {
  const { current } = useLanguageOptions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarMenuButton className="cursor-pointer" onMouseEnter={preloadEnglishCatalog} onFocus={preloadEnglishCatalog} />}
      >
        <HugeiconsIcon icon={LanguageSquareIcon} />
        <span>{current?.nativeName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <LanguageMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
