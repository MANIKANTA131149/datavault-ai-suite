import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const toastIcons = {
  success: (
    <span className="toast-icon-wrap toast-icon-success">
      <CheckCircle2 className="h-[15px] w-[15px]" strokeWidth={2.5} />
    </span>
  ),
  error: (
    <span className="toast-icon-wrap toast-icon-error">
      <XCircle className="h-[15px] w-[15px]" strokeWidth={2.5} />
    </span>
  ),
  warning: (
    <span className="toast-icon-wrap toast-icon-warning">
      <AlertTriangle className="h-[14px] w-[14px]" strokeWidth={2.5} />
    </span>
  ),
  info: (
    <span className="toast-icon-wrap toast-icon-info">
      <Info className="h-[15px] w-[15px]" strokeWidth={2.5} />
    </span>
  ),
  loading: (
    <span className="toast-icon-wrap toast-icon-loading">
      <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={2} />
    </span>
  ),
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster-root"
      position="top-right"
      gap={8}
      closeButton
      duration={4500}
      icons={toastIcons}
      toastOptions={{
        classNames: {
          toast: "et",
          title: "et-title",
          description: "et-desc",
          actionButton: "et-action",
          cancelButton: "et-cancel",
          closeButton: "et-close",
          icon: "et-icon",
          success: "et--success",
          error: "et--error",
          warning: "et--warning",
          info: "et--info",
          loading: "et--loading",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
