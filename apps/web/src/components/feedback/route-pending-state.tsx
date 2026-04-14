import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface RoutePendingStateProps {
  badge?: string;
  description?: string;
  title?: string;
}

export function RoutePendingState({
  badge = "Loading",
  description = "We are preparing the next view and loading any required route data.",
  title = "Loading route",
}: RoutePendingStateProps) {
  return (
    <section className="flex min-h-[calc(100vh-12rem)] items-center justify-center py-6">
      <Card className="w-full max-w-2xl border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <Badge className="w-fit rounded-full" variant="outline">
            {badge}
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
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-24 rounded-full" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export type { RoutePendingStateProps };
