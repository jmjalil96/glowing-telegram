import {
  Link,
  Outlet,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";

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

function RootLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <Link className="inline-flex items-center gap-3" to="/">
            <Badge className="rounded-full px-3 py-1 text-[0.7rem] tracking-[0.18em] uppercase">
              Techbros
            </Badge>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Web app</p>
              <p className="text-xs text-muted-foreground">
                Placeholder routes built on shadcn
              </p>
            </div>
          </Link>
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-2"
          >
            <Button
              asChild
              className="rounded-full"
              size="sm"
              variant={pathname === "/" ? "default" : "ghost"}
            >
              <Link activeOptions={{ exact: true }} to="/">
                Home
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full"
              size="sm"
              variant={pathname === "/dashboard" ? "default" : "ghost"}
            >
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 sm:px-6 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}

function NotFoundPage() {
  return (
    <section className="flex min-h-[calc(100vh-12rem)] items-center justify-center py-6">
      <Card className="w-full max-w-2xl border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <Badge className="w-fit rounded-full" variant="outline">
            Not found
          </Badge>
          <div className="space-y-2">
            <CardTitle className="text-3xl tracking-tight sm:text-4xl">
              Page not found.
            </CardTitle>
            <CardDescription className="max-w-xl text-sm leading-6 sm:text-base">
              The route you requested does not exist in the current placeholder
              app.
            </CardDescription>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <Button asChild className="rounded-full">
            <Link to="/">Return home</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});
