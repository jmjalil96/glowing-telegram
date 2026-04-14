import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isApiError } from "@/lib/api";

interface RouteErrorStateProps extends ErrorComponentProps {
  homeHref?: "/" | "/dashboard";
  retryLabel?: string;
  title?: string;
}

const getErrorMessage = (error: unknown): string => {
  if (isApiError(error) || error instanceof Error) {
    return error.message;
  }

  return "Something unexpected happened while loading this route.";
};

export function RouteErrorState({
  error,
  homeHref = "/",
  reset,
  retryLabel = "Try again",
  title = "Something went wrong.",
}: RouteErrorStateProps) {
  return (
    <section className="flex min-h-[calc(100vh-12rem)] items-center justify-center py-6">
      <Card className="w-full max-w-2xl border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <div className="space-y-2">
            <CardTitle className="text-3xl tracking-tight sm:text-4xl">
              {title}
            </CardTitle>
            <CardDescription className="max-w-xl text-sm leading-6 sm:text-base">
              The route could not finish loading. You can retry the request or
              return to a stable part of the app.
            </CardDescription>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-6 pt-6">
          <Alert variant="destructive">
            <AlertTitle>Route load failed</AlertTitle>
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-full" onClick={() => reset()}>
              {retryLabel}
            </Button>
            <Button asChild className="rounded-full" variant="outline">
              <Link to={homeHref}>Return home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export type { RouteErrorStateProps };
