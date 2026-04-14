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
    badge: "Protected routes",
    title: "Dashboard access is now gated",
    description:
      "The dashboard now sits behind the shared session guard, so unauthenticated traffic is redirected through the login flow.",
  },
  {
    badge: "Auth contracts",
    title: "Pages mirror the API contract",
    description:
      "Login, forgot-password, and reset-password now match the API response envelope, cookie session model, and query cache updates.",
  },
  {
    badge: "Local integration",
    title: "Same-origin API wiring stays intact",
    description:
      "The web app still calls relative /api routes, so the new auth flows align with the existing Vite proxy and backend cookie strategy.",
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
              Public entry point for the authenticated web experience.
            </CardDescription>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-6 pt-6">
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Auth is now wired through the existing cookie session contract. Use
            the login and recovery routes here, or open the protected dashboard
            if you already have a valid session.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild className="rounded-full" variant="outline">
              <Link preload="intent" to="/dashboard">
                Open dashboard
              </Link>
            </Button>
            <Button asChild className="rounded-full" variant="ghost">
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
