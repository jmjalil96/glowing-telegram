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

const featureCards = [
  {
    badge: "Route foundation",
    title: "TanStack Router owns the shell",
    description:
      "TanStack Router now owns the app shell and route tree, so adding real screens will not require another bootstrap refactor.",
  },
  {
    badge: "Frontend workspace",
    title: "Tooling is already aligned",
    description:
      "Vite, TypeScript, linting, formatting, and build scripts are already aligned with the rest of the repo.",
  },
  {
    badge: "Local integration",
    title: "Proxy path is in place",
    description:
      "The development proxy is ready, so future product pages can call API routes through the same local origin when needed.",
  },
] as const;

export function HomePage() {
  return (
    <section className="flex flex-col gap-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <Badge className="w-fit rounded-full" variant="secondary">
            Homepage
          </Badge>
          <div className="space-y-2">
            <CardTitle className="text-4xl tracking-tight sm:text-5xl">
              Techbros Web
            </CardTitle>
            <CardDescription className="text-sm leading-6 sm:text-base">
              Public placeholder for the web experience.
            </CardDescription>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-6 pt-6">
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            The router, workspace wiring, and frontend tooling are in place.
            This home route is the temporary surface until product-specific
            pages start landing.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
            <Button asChild className="rounded-full" variant="outline">
              <a href="#homepage-overview">View overview</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3" id="homepage-overview">
        {featureCards.map((feature) => (
          <Card
            className="border-border/60 shadow-sm"
            key={feature.title}
            size="sm"
          >
            <CardHeader className="gap-3">
              <Badge className="w-fit rounded-full" variant="outline">
                {feature.badge}
              </Badge>
              <div className="space-y-2">
                <CardTitle className="text-lg leading-6">
                  {feature.title}
                </CardTitle>
                <CardDescription className="text-sm leading-6">
                  {feature.description}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
