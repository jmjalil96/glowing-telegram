import { createFileRoute } from "@tanstack/react-router";

import {
  getPostLoginHref,
  validateLoginSearch,
} from "@/features/auth/auth-routing";
import { LoginPage } from "@/pages/login-page";

export const Route = createFileRoute("/_guest/login")({
  component: LoginRoute,
  validateSearch: validateLoginSearch,
});

function LoginRoute() {
  const search = Route.useSearch();

  return <LoginPage redirectTo={getPostLoginHref(search)} />;
}
