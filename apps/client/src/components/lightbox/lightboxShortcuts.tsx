import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-foreground">
      {children}
    </kbd>
  );
}

export function LightboxShortcuts({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("lightbox");
  const rows: { label: string; keys: ReactNode }[] = [
    {
      label: t("shortcut.navigate"),
      keys: (
        <>
          <Key>←</Key>
          <Key>→</Key>
        </>
      ),
    },
    {
      label: t("shortcut.firstLast"),
      keys: (
        <>
          <Key>Home</Key>
          <Key>End</Key>
        </>
      ),
    },
    {
      label: t("shortcut.zoom"),
      keys: (
        <>
          <Key>+</Key>
          <Key>−</Key>
        </>
      ),
    },
    { label: t("shortcut.fit"), keys: <Key>0</Key> },
    { label: t("shortcut.actualSize"), keys: <Key>1</Key> },
    {
      label: t("shortcut.pan"),
      keys: (
        <>
          <Key>↑</Key>
          <Key>↓</Key>
          <Key>←</Key>
          <Key>→</Key>
        </>
      ),
    },
    { label: t("shortcut.peek"), keys: <Key>P</Key> },
    { label: t("shortcut.details"), keys: <Key>I</Key> },
    { label: t("shortcut.fullscreen"), keys: <Key>F</Key> },
    { label: t("shortcut.shortcuts"), keys: <Key>?</Key> },
    { label: t("shortcut.close"), keys: <Key>Esc</Key> },
  ];

  return (
    <motion.div
      className="absolute inset-0 z-30 grid place-items-center bg-black/60 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <section
        aria-label={t("shortcuts")}
        className="relative w-full max-w-sm rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 text-base leading-none font-medium">{t("shortcuts")}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")} className="absolute top-2 right-2 cursor-pointer">
          <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
        </Button>
        <ul className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="flex shrink-0 gap-1">{row.keys}</span>
            </li>
          ))}
        </ul>
      </section>
    </motion.div>
  );
}
