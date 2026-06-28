import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

/**
 * AdminCard3D — single unified 3D-polished card for the admin panel.
 *
 * It re-exports shadcn `Card` parts pre-wired with the project's
 * `--admin-shadow-3d` tokens so every admin page renders the exact same
 * border, radius, elevation, hover-lift and typography rhythm.
 *
 * Usage:
 *   <AdminCard3D>
 *     <AdminCard3D.Header>
 *       <AdminCard3D.Title>Title</AdminCard3D.Title>
 *       <AdminCard3D.Description>Subtitle</AdminCard3D.Description>
 *     </AdminCard3D.Header>
 *     <AdminCard3D.Content>…</AdminCard3D.Content>
 *   </AdminCard3D>
 *
 * Variants:
 *   tone="default" | "alt" | "sunken"
 *   interactive — adds hover-lift + focus ring
 */

type Tone = "default" | "alt" | "sunken";

export interface AdminCard3DProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  interactive?: boolean;
}

const toneClass: Record<Tone, string> = {
  default: "bg-white",
  alt: "admin-card-alt",
  sunken: "admin-card-sunken",
};

const AdminCard3DRoot = React.forwardRef<HTMLDivElement, AdminCard3DProps>(
  ({ className, tone = "default", interactive = false, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn(
        "admin-card admin-card-elevated rounded-[14px] border-slate-200",
        toneClass[tone],
        interactive && "admin-card-interactive cursor-pointer",
        className,
      )}
      {...props}
    />
  ),
);
AdminCard3DRoot.displayName = "AdminCard3D";

type CardCompound = typeof AdminCard3DRoot & {
  Header: typeof CardHeader;
  Title: typeof CardTitle;
  Description: typeof CardDescription;
  Content: typeof CardContent;
  Footer: typeof CardFooter;
};

const AdminCard3D = AdminCard3DRoot as CardCompound;
AdminCard3D.Header = CardHeader;
AdminCard3D.Title = CardTitle;
AdminCard3D.Description = CardDescription;
AdminCard3D.Content = CardContent;
AdminCard3D.Footer = CardFooter;

export { AdminCard3D };
export default AdminCard3D;
