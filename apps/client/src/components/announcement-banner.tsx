import { Alert02Icon, AlertCircleIcon, ArrowDown01Icon, Cancel01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Announcement } from "@/hooks/useSettings";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

const URL_REGEX = /https?:\/\/[^\s]+/;
const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+)/;

function MessageWithLinks({ text, linkClassName }: { text: string; linkClassName: string }) {
  const parts = text.split(URL_SPLIT_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className={cn("underline-offset-2 hover:underline", linkClassName)}>
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

const DISMISSED_KEY = "openbts:dismissed-announcement";
const CACHED_KEY = "openbts:cached-announcement";

function readCachedAnnouncement(): Announcement | undefined {
  try {
    const raw = localStorage.getItem(CACHED_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Announcement;
    if (typeof parsed?.message === "string" && parsed.enabled) return parsed;
  } catch {}
  return undefined;
}

const typeConfig = {
  info: {
    icon: InformationCircleIcon,
    className: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400",
    dismissClassName: "text-blue-700/70 hover:text-blue-700 dark:text-blue-400/70 dark:hover:text-blue-400",
  },
  warning: {
    icon: Alert02Icon,
    className: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400",
    dismissClassName: "text-amber-700/70 hover:text-amber-700 dark:text-amber-400/70 dark:hover:text-amber-400",
  },
  error: {
    icon: AlertCircleIcon,
    className: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400",
    dismissClassName: "text-red-700/70 hover:text-red-700 dark:text-red-400/70 dark:hover:text-red-400",
  },
} as const;

export function AnnouncementBanner() {
  const { data: settings } = useSettings();
  const [cachedAnnouncement] = useState(readCachedAnnouncement);
  const [dismissed, setDismissed] = useState(() => {
    let value: string | null = null;
    try {
      value = localStorage.getItem(DISMISSED_KEY);
    } catch {}
    return value ?? "";
  });
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const observerRef = useRef<ResizeObserver>(null);

  const textRef = useCallback((el: HTMLParagraphElement | null) => {
    observerRef.current?.disconnect();
    if (!el) return;
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    observerRef.current = new ResizeObserver(check);
    observerRef.current.observe(el);
  }, []);

  const announcement = settings === undefined ? cachedAnnouncement : settings?.announcement;

  useEffect(() => {
    if (settings === undefined) return;
    try {
      const current = settings?.announcement;
      if (current?.enabled && current.message) localStorage.setItem(CACHED_KEY, JSON.stringify(current));
      else localStorage.removeItem(CACHED_KEY);
    } catch {}
  }, [settings]);

  const handleDismiss = useCallback(() => {
    if (!announcement?.message) return;
    setDismissed(announcement.message);
    try {
      localStorage.setItem(DISMISSED_KEY, announcement.message);
    } catch {}
  }, [announcement?.message]);

  if (!announcement?.enabled || !announcement.message) return null;
  if (dismissed === announcement.message) return null;

  const config = typeConfig[announcement.type] ?? typeConfig.info;

  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 border-b text-sm shrink-0", config.className)}>
      <HugeiconsIcon icon={config.icon} className="size-4 shrink-0" />
      <p ref={textRef} className={cn("flex-1 min-w-0", expanded ? "wrap-break-word" : "truncate")}>
        <MessageWithLinks text={announcement.message} linkClassName="font-medium" />
      </p>
      <div className="flex items-center gap-1 shrink-0">
        {(isTruncated || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className={cn("inline-flex size-6 items-center justify-center rounded-full transition-colors", config.dismissClassName)}
            aria-label={expanded ? "Collapse announcement" : "Expand announcement"}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss announcement"
          className={cn("inline-flex size-6 items-center justify-center rounded-full transition-colors", config.dismissClassName)}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
