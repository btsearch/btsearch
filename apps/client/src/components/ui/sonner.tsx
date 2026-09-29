import { Alert02Icon, AlertCircleIcon, CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { buttonVariants } from "./button";
import { Spinner } from "./spinner";
import { useTheme } from "@/components/preferences/themeProvider";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  const isMobile = useIsMobile();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={isMobile ? "top-center" : "bottom-right"}
      className="toaster group"
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-green-600 dark:text-green-400" />,
        info: <HugeiconsIcon icon={InformationCircleIcon} className="size-4 text-muted-foreground" />,
        warning: <HugeiconsIcon icon={Alert02Icon} className="size-4 text-amber-600 dark:text-amber-400" />,
        error: <HugeiconsIcon icon={AlertCircleIcon} className="size-4 text-destructive" />,
        loading: <Spinner className="size-4" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "flex w-(--width) items-start gap-2.5 rounded-lg border bg-popover px-3 py-2.5 font-sans text-foreground shadow-lg",
          success: "border-green-500/25 bg-linear-to-r from-green-500/10 to-green-500/10",
          warning: "border-amber-500/25 bg-linear-to-r from-amber-500/10 to-amber-500/10",
          error: "border-destructive/25 bg-linear-to-r from-destructive/10 to-destructive/10",
          icon: "mt-0.5 flex size-4 shrink-0 items-center justify-center",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "text-sm leading-5 font-medium text-foreground",
          description: "text-xs leading-snug !text-muted-foreground",
          actionButton: cn(buttonVariants({ variant: "outline", size: "sm" }), "self-center"),
          cancelButton: cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-center"),
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
