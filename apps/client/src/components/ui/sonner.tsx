import { Alert02Icon, CheckmarkCircle02Icon, InformationCircleIcon, MultiplicationSignCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/components/theme-provider";
import { useIsMobile } from "@/hooks/useMobile";

import { Spinner } from "./spinner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  const isMobile = useIsMobile();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={isMobile ? "top-center" : "bottom-right"}
      className="toaster group"
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4 text-green-600 dark:text-green-400" />,
        info: <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />,
        warning: <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 text-amber-600 dark:text-amber-400" />,
        error: <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2} className="size-4 text-destructive" />,
        loading: <Spinner className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          success: "!bg-green-50 dark:!bg-green-950 !border-green-200 dark:!border-green-800 !text-green-900 dark:!text-green-100",
          error: "!bg-red-50 dark:!bg-red-950 !border-red-200 dark:!border-red-800",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
