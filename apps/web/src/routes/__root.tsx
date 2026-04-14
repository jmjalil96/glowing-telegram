import {
  Outlet,
  type ErrorComponentProps,
  createRootRouteWithContext,
} from "@tanstack/react-router";

import { NotFoundState } from "@/components/feedback/not-found-state";
import { RouteErrorState } from "@/components/feedback/route-error-state";
import { RoutePendingState } from "@/components/feedback/route-pending-state";
import { Toaster } from "@/components/ui/sonner";
import type { RouterContext } from "@/router-context";

function RootLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
      <Toaster />
    </div>
  );
}

function RootNotFoundPage() {
  return <NotFoundState />;
}

function RootPendingPage() {
  return <RoutePendingState />;
}

function RootErrorPage(props: ErrorComponentProps) {
  return <RouteErrorState {...props} />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RootErrorPage,
  notFoundComponent: RootNotFoundPage,
  pendingComponent: RootPendingPage,
});
