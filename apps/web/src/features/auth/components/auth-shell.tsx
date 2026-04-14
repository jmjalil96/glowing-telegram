import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface AuthShellProps {
  badge: string;
  children: ReactNode;
  description: string;
  footer?: ReactNode;
  title: string;
}

export function AuthShell({
  badge,
  children,
  description,
  footer,
  title,
}: AuthShellProps) {
  return (
    <section className="flex min-h-screen items-center justify-center py-6">
      <Card className="w-full max-w-lg border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <Badge className="w-fit rounded-full" variant="secondary">
            {badge}
          </Badge>
          <div className="space-y-2">
            <CardTitle className="text-3xl tracking-tight sm:text-4xl">
              {title}
            </CardTitle>
            <CardDescription className="text-sm leading-6 sm:text-base">
              {description}
            </CardDescription>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-6 pt-6">
          {children}
          {footer ? (
            <>
              <Separator />
              <div className="pt-2">{footer}</div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
