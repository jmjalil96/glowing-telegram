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
    value: "03",
    title: "Primary panels",
    description:
      "Summary, recent activity, and quick actions are stubbed out below.",
  },
  {
    value: "02",
    title: "Active routes",
    description:
      "The router currently exposes the homepage and this dashboard placeholder.",
  },
  {
    value: "00",
    title: "Live dependencies",
    description:
      "No loaders, auth, or API-bound widgets are attached to this route yet.",
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
            This route exists to establish the app-shaped structure now. Data
            loading, auth, and live backend integrations can layer in later
            without changing the route layout.
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
              <li>Introduce route-level data when the API contract exists.</li>
              <li>Decide which routes should eventually be authenticated.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
