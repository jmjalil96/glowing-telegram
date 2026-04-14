import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { useLoginForm } from "@/features/auth/hooks/use-login-form";

interface LoginPageProps {
  redirectTo: string;
}

export function LoginPage({ redirectTo }: LoginPageProps) {
  const navigate = useNavigate();
  const { form, formError, isPending, submit } = useLoginForm({
    onSuccess: async () => {
      toast.success("Signed in.");
      await navigate({
        href: redirectTo,
        replace: true,
      });
    },
  });

  return (
    <AuthShell
      badge="Account"
      description="Use your verified account to continue into the protected app routes."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Need a password reset link instead?
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full" variant="outline">
              <Link to="/forgot-password">Reset password</Link>
            </Button>
            <Button asChild className="rounded-full" variant="ghost">
              <Link to="/">Return home</Link>
            </Button>
          </div>
        </div>
      }
      title="Sign in to Techbros"
    >
      <LoginForm
        form={form}
        formError={formError}
        isPending={isPending}
        onSubmit={submit}
      />
    </AuthShell>
  );
}
