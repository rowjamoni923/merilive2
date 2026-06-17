import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      // Pro pattern (Chamet/Bigo): system banners must clear the status-bar
      // inset. Without this offset the toast renders behind the Android
      // notch/status-bar and overlaps the logo/header. 56px floor handles
      // devices that don't report safe-area-inset-top.
      offset={{
        top: "max(env(safe-area-inset-top, 0px) + 8px, 56px)",
        right: 16,
        bottom: 16,
        left: 16,
      }}
      style={{ zIndex: 99999 }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
