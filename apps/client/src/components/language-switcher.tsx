import { PL, US } from "country-flag-icons/react/3x2";
import { useTranslation } from "react-i18next";

import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { type SupportedLanguage, ensureLanguageResources, persistLanguage, supportedLanguages } from "@/i18n/config";
import { authClient } from "@/lib/authClient";

const flagComponents: Record<string, React.ComponentType<{ className?: string }>> = {
  US,
  PL,
};

const preloadEnglishCatalog = () => void ensureLanguageResources("en-US");

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const { data: session } = authClient.useSession();
  const currentUserLang = i18n.language;

  const currentLanguage = supportedLanguages.find((lang) => lang.code === currentUserLang);
  const FlagComponent = currentLanguage ? flagComponents[currentLanguage.countryCode] : null;

  const handleLanguageChange = (code: SupportedLanguage) => {
    void ensureLanguageResources(code).then(() => i18n.changeLanguage(code));
    persistLanguage(code);
    if (session?.user) void authClient.updateUser({ locale: code });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton onMouseEnter={preloadEnglishCatalog} onFocus={preloadEnglishCatalog} />}>
        {FlagComponent && <FlagComponent className="h-4 w-5 rounded-sm" />}
        <span className="text-sm font-semibold">{currentLanguage?.nativeName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={currentUserLang}>
          {supportedLanguages.map((lang) => {
            const Flag = flagComponents[lang.countryCode];
            return (
              <DropdownMenuRadioItem key={lang.code} value={lang.code} onClick={() => handleLanguageChange(lang.code)}>
                {Flag && <Flag className="h-4 w-5 rounded-sm" />}
                <span>{lang.nativeName}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
