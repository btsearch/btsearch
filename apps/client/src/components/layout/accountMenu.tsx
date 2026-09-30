import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ComputerIcon,
  GitBranchIcon,
  LanguageSquareIcon,
  Logout02Icon,
  Moon02Icon,
  PaintBoardIcon,
  Settings02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { type ComponentProps, useId, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { RoleBadge } from "@/components/app/roleBadge";
import { roleWashClassName } from "@/components/app/roleTone";
import { UserAvatar } from "@/components/app/userAvatar";
import { preloadEnglishCatalog, useLanguageChange } from "@/components/preferences/languageSwitcher";
import { useTheme } from "@/components/preferences/themeProvider";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/useMobile";
import { supportedLanguages } from "@/i18n/config";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

export type AccountUser = NonNullable<ReturnType<typeof authClient.useSession>["data"]>["user"];

const ITEM_CLASS = "h-8 cursor-pointer gap-2.5 px-2 focus:bg-muted pointer-coarse:h-11 pointer-coarse:gap-3 pointer-coarse:px-3";
const THEME_SEGMENT_CLASS =
  "inline-flex h-full min-w-7 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-background data-checked:text-foreground data-checked:shadow-sm data-highlighted:text-foreground dark:data-checked:border-input dark:data-checked:bg-input/30";
const THEME_OPTIONS = [
  { value: "light", icon: Sun03Icon, labelKey: "theme.light" },
  { value: "dark", icon: Moon02Icon, labelKey: "theme.dark" },
  { value: "system", icon: ComputerIcon, labelKey: "theme.system" },
] as const;
const GIT_COMMIT = import.meta.env.VITE_GIT_COMMIT as string | undefined;
const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined;

function AccountMenuHeader({ user }: { user: AccountUser }) {
  const { t } = useTranslation("settings");
  const className = cn("flex items-center gap-3 border-b border-border/60 p-3 pointer-coarse:p-3.5", roleWashClassName(user.role));
  const identity = (
    <>
      <UserAvatar user={user} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <RoleBadge role={user.role} className="shrink-0" />
        </div>
        <p className="truncate text-xs text-muted-foreground">{user.username ? `@${user.username}` : user.email}</p>
      </div>
    </>
  );

  if (!user.username) return <div className={className}>{identity}</div>;

  return (
    <MenuPrimitive.Item
      render={<Link to="/users/$username" params={{ username: user.username }} />}
      className={cn(className, "group/profile cursor-pointer outline-none data-highlighted:bg-muted/50")}
    >
      {identity}
      <span
        aria-hidden="true"
        className="shrink-0 text-muted-foreground transition-transform group-data-highlighted/profile:translate-x-0.5 group-data-highlighted/profile:text-foreground"
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
      </span>
      <span className="sr-only">{t("profile.viewProfile")}</span>
    </MenuPrimitive.Item>
  );
}

function ThemeRow() {
  const { t } = useTranslation("common");
  const { theme, setTheme } = useTheme();
  const labelId = useId();

  return (
    <div className="flex h-9 items-center gap-2.5 pr-1 pl-2 text-sm pointer-coarse:h-13 pointer-coarse:gap-3 pointer-coarse:pr-1.5 pointer-coarse:pl-3">
      <HugeiconsIcon icon={PaintBoardIcon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span id={labelId} className="flex-1">
        {t("theme.title")}
      </span>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={setTheme}
        aria-labelledby={labelId}
        className="flex h-7 items-center gap-0.5 rounded-lg bg-muted p-[3px] pointer-coarse:h-9"
      >
        {THEME_OPTIONS.map((option) => (
          <MenuPrimitive.RadioItem key={option.value} value={option.value} aria-label={t(option.labelKey)} className={THEME_SEGMENT_CLASS}>
            <HugeiconsIcon icon={option.icon} aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="hidden @xs:inline">{t(option.labelKey)}</span>
          </MenuPrimitive.RadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </div>
  );
}

function LanguageRowLabel() {
  const { t, i18n } = useTranslation("settings");
  const current = supportedLanguages.find((language) => language.code === i18n.language);

  return (
    <>
      <HugeiconsIcon icon={LanguageSquareIcon} className="text-muted-foreground" />
      <span className="flex-1">{t("preferences.language")}</span>
      <span className="text-[0.8125rem] text-muted-foreground">{current?.nativeName}</span>
    </>
  );
}

function LanguageOptions({ onSelect }: { onSelect?: () => void }) {
  const { i18n } = useTranslation();
  const changeLanguage = useLanguageChange();
  const displayNames = new Intl.DisplayNames([i18n.language], { type: "language" });

  return (
    <DropdownMenuRadioGroup
      value={i18n.language}
      onValueChange={(code) => {
        changeLanguage(code);
        onSelect?.();
      }}
    >
      {supportedLanguages.map((language) => {
        const hint = displayNames.of(new Intl.Locale(language.code).language);
        const showHint = hint !== undefined && hint.toLocaleLowerCase() !== language.nativeName.toLocaleLowerCase();
        return (
          <DropdownMenuRadioItem
            key={language.code}
            value={language.code}
            closeOnClick={!onSelect}
            className="h-8 cursor-pointer gap-2 pl-2 focus:bg-muted pointer-coarse:h-11 pointer-coarse:pl-3"
          >
            <span lang={language.code}>{language.nativeName}</span>
            {showHint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
          </DropdownMenuRadioItem>
        );
      })}
    </DropdownMenuRadioGroup>
  );
}

function LanguageItem({ onOpen }: { onOpen?: () => void }) {
  if (!onOpen) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className={cn(ITEM_CLASS, "data-popup-open:bg-muted [&>svg:last-child]:text-muted-foreground")}
          onPointerEnter={preloadEnglishCatalog}
          onFocus={preloadEnglishCatalog}
        >
          <LanguageRowLabel />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-52 rounded-lg">
          <LanguageOptions />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenuItem
      closeOnClick={false}
      onClick={() => {
        preloadEnglishCatalog();
        onOpen();
      }}
      className={ITEM_CLASS}
    >
      <LanguageRowLabel />
      <HugeiconsIcon icon={ArrowRight01Icon} className="text-muted-foreground" />
    </DropdownMenuItem>
  );
}

function LanguageView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation("common");

  return (
    <>
      <DropdownMenuItem closeOnClick={false} onClick={onBack} className={cn(ITEM_CLASS, "font-semibold")}>
        <HugeiconsIcon icon={ArrowLeft01Icon} className="text-muted-foreground" />
        <span className="sr-only">{t("actions.back")}</span>
        {t("settings:preferences.language")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <LanguageOptions onSelect={onBack} />
    </>
  );
}

function SignOutItem() {
  const { t } = useTranslation("common");
  const [isPending, startTransition] = useTransition();

  const signOut = () => {
    if (isPending) return;
    startTransition(async () => {
      const { error } = await authClient.signOut();
      if (error) {
        toast.error(t("error.actionFailed"), { description: t("error.tryLater") });
        return;
      }
      window.location.href = "/";
    });
  };

  return (
    <DropdownMenuItem
      closeOnClick={false}
      aria-disabled={isPending || undefined}
      onClick={signOut}
      className={cn(ITEM_CLASS, isPending && "cursor-default text-muted-foreground")}
    >
      {isPending ? <Spinner /> : <HugeiconsIcon icon={Logout02Icon} className="text-muted-foreground" />}
      {t(isPending ? "actions.signingOut" : "actions.signOut")}
    </DropdownMenuItem>
  );
}

function BuildFooter() {
  const { t } = useTranslation("nav");

  return (
    <div className="flex h-7.5 items-center gap-1.5 border-t bg-muted/50 px-3 text-[11px] text-muted-foreground pointer-coarse:h-9 pointer-coarse:px-3.5 pointer-coarse:text-xs">
      <HugeiconsIcon icon={GitBranchIcon} aria-hidden="true" className="size-3 shrink-0" />
      <span className="min-w-0 truncate">
        {GIT_COMMIT ? (
          <MenuPrimitive.Item
            render={<a href={`https://github.com/btsearch/btsearch/commit/${GIT_COMMIT}`} target="_blank" rel="noopener noreferrer" />}
            className="font-mono text-primary outline-none hover:underline data-highlighted:underline"
          >
            {GIT_COMMIT}
          </MenuPrimitive.Item>
        ) : null}
        {APP_VERSION ? ` (v${APP_VERSION})` : null}
      </span>
      <MenuPrimitive.Item
        render={<Link to="/changelog" />}
        className="ml-auto shrink-0 outline-none hover:text-foreground hover:underline data-highlighted:text-foreground data-highlighted:underline"
      >
        {t("items.changelog")}
      </MenuPrimitive.Item>
    </div>
  );
}

type AccountMenuContentProps = ComponentProps<typeof DropdownMenuContent> & { user: AccountUser };

export function AccountMenuContent({ user, className, ...props }: AccountMenuContentProps) {
  const { t } = useTranslation("nav");
  const isMobile = useIsMobile();
  const [languageView, setLanguageView] = useState(false);

  return (
    <DropdownMenuContent className={cn("@container w-72 p-0", className)} {...props}>
      <AccountMenuHeader user={user} />
      <div className="p-1">
        {isMobile && languageView ? (
          <LanguageView onBack={() => setLanguageView(false)} />
        ) : (
          <>
            <DropdownMenuItem render={<Link to="/settings" />} className={ITEM_CLASS}>
              <HugeiconsIcon icon={Settings02Icon} className="text-muted-foreground" />
              {t("items.settings")}
            </DropdownMenuItem>
            <ThemeRow />
            <LanguageItem onOpen={isMobile ? () => setLanguageView(true) : undefined} />
            <DropdownMenuSeparator />
            <SignOutItem />
          </>
        )}
      </div>
      <BuildFooter />
    </DropdownMenuContent>
  );
}
