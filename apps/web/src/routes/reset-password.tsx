import { createFileRoute } from "@tanstack/react-router";

import { validateResetPasswordSearch } from "@/features/auth/auth-routing";
import { ResetPasswordPage } from "@/pages/reset-password-page";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordRoute,
  validateSearch: validateResetPasswordSearch,
});

function ResetPasswordRoute() {
  const search = Route.useSearch();

  return (
    <ResetPasswordPage key={search.token ?? "missing"} token={search.token} />
  );
}
