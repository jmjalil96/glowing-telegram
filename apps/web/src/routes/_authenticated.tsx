import {
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AuthenticatedUser } from "@/features/auth/auth-client";
import {
  authMeQueryOptions,
  clearAuthState,
  useLogoutMutation,
} from "@/features/auth/auth-query";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const authenticatedUser =
      await context.queryClient.fetchQuery(authMeQueryOptions());

    if (authenticatedUser === null) {
      await clearAuthState(context.queryClient);

      // TanStack Router redirects are thrown intentionally from loaders/guards.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        replace: true,
        search: {
          redirect: location.href,
        },
        to: "/login",
      });
    }

    return {
      authenticatedUser,
    };
  },
  component: AuthenticatedLayout,
});

const logoutErrorMessage =
  "We could not sign you out right now. Please try again.";

function AuthenticatedLayout() {
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { authenticatedUser } = Route.useRouteContext();
  const logoutMutation = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success("Signed out.");
      await router.invalidate({ sync: true });
    } catch {
      toast.error(logoutErrorMessage);
    }
  };

  const pageTitle = pathname === "/dashboard" ? "Dashboard" : "Workspace";

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen>
        <AppSidebar
          authenticatedUser={authenticatedUser}
          isLoggingOut={logoutMutation.isPending}
          onLogout={() => {
            void handleLogout();
          }}
        />
        <SidebarInset>
          <header className="border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
            <div className="flex min-h-14 items-center gap-3 px-4 sm:px-6">
              <SidebarTrigger className="-ml-1" />
              <Separator className="h-5" orientation="vertical" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {pageTitle}
                </p>
              </div>
            </div>
          </header>
          <main className="flex flex-1 flex-col px-4 py-6 sm:px-6">
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

declare module "@tanstack/react-router" {
  interface BeforeLoadRouteOptions {
    authenticatedUser?: AuthenticatedUser;
  }
}
