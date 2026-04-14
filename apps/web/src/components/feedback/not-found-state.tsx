import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface NotFoundStateProps {
  actionHref?: "/" | "/dashboard";
  actionLabel?: string;
  description?: string;
  title?: string;
}

export function NotFoundState({
  actionHref = "/",
  actionLabel = "Return home",
  description = "The route you requested does not exist in the current placeholder app.",
  title = "Page not found.",
}: NotFoundStateProps) {
  return (
    <section className="flex min-h-[calc(100vh-12rem)] items-center justify-center py-6">
      <Card className="w-full max-w-2xl border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <Badge className="w-fit rounded-full" variant="outline">
            Not found
          </Badge>
          <div className="space-y-2">
            <CardTitle className="text-3xl tracking-tight sm:text-4xl">
              {title}
            </CardTitle>
            <CardDescription className="max-w-xl text-sm leading-6 sm:text-base">
              {description}
            </CardDescription>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <Button asChild className="rounded-full">
            <Link to={actionHref}>{actionLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

export type { NotFoundStateProps };
