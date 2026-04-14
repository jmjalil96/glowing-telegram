import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const statCards = [
  {
    value: "01",
    title: "Protected route",
    description:
      "This page now loads behind the shared session guard used by the router and TanStack Query.",
  },
  {
    value: "03",
    title: "Auth screens",
    description:
      "Login, forgot-password, and reset-password are now part of the public route tree.",
  },
  {
    value: "01",
    title: "Session query",
    description:
      "The app and route guards now share the same auth/me query as the single client-side source of truth.",
  },
] as const;

export function DashboardPage() {
  return (
    <section className="flex flex-col gap-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <Badge className="w-fit rounded-full" variant="secondary">
            Dashboard
          </Badge>
          <div className="space-y-2">
            <CardTitle className="text-4xl tracking-tight sm:text-5xl">
              Workspace dashboard
            </CardTitle>
            <CardDescription className="text-sm leading-6 sm:text-base">
              Internal placeholder for the application surface.
            </CardDescription>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            This route now confirms session state before rendering. Product data
            and authenticated widgets can layer onto the same shell without
            changing the auth foundation.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {statCards.map((stat) => (
          <Card
            className="border-border/60 shadow-sm"
            key={stat.title}
            size="sm"
          >
            <CardHeader className="gap-3">
              <Badge className="w-fit rounded-full" variant="outline">
                {stat.value}
              </Badge>
              <div className="space-y-2">
                <CardTitle className="text-lg leading-6">
                  {stat.title}
                </CardTitle>
                <CardDescription className="text-sm leading-6">
                  {stat.description}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="gap-3">
            <Badge className="w-fit rounded-full" variant="outline">
              Recent activity
            </Badge>
            <div className="space-y-2">
              <CardTitle className="text-lg">Recent activity</CardTitle>
              <CardDescription className="text-sm leading-6">
                No activity feed is connected yet. This panel marks the intended
                location.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="gap-3">
            <Badge className="w-fit rounded-full" variant="outline">
              Quick actions
            </Badge>
            <div className="space-y-2">
              <CardTitle className="text-lg">Quick actions</CardTitle>
              <CardDescription className="text-sm leading-6">
                The next product steps are still intentionally lightweight.
              </CardDescription>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6">
            <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
              <li>Add the first real dashboard widget.</li>
              <li>
                Introduce route-level data on top of the existing session guard.
              </li>
              <li>
                Expand the signed-in shell with private data and user-specific
                actions.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
