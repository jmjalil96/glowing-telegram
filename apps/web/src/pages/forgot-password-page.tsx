import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { useForgotPasswordForm } from "@/features/auth/hooks/use-forgot-password-form";

export function ForgotPasswordPage() {
  const [isSuccessState, setIsSuccessState] = useState(false);
  const { form, formError, isPending, submit } = useForgotPasswordForm({
    onSuccess: () => {
      setIsSuccessState(true);
      toast.success("If the account exists, a reset link is on its way.");
    },
  });

  if (isSuccessState) {
    return (
      <AuthShell
        badge="Recovery"
        description="If an active account exists for that email, we sent a password reset link."
        footer={
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link to="/login">Back to login</Link>
            </Button>
            <Button
              className="rounded-full"
              onClick={() => setIsSuccessState(false)}
              type="button"
              variant="outline"
            >
              Send another email
            </Button>
          </div>
        }
        title="Check your email"
      >
        <Alert>
          <AlertTitle>Request received</AlertTitle>
          <AlertDescription>
            Open the newest message from Techbros and follow the reset link to
            choose a new password.
          </AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      badge="Recovery"
      description="Enter the email for your account and we will send a reset link if the account is eligible."
      footer={
        <div className="flex flex-wrap gap-3">
          <Button asChild className="rounded-full" variant="outline">
            <Link to="/login">Back to login</Link>
          </Button>
          <Button asChild className="rounded-full" variant="ghost">
            <Link to="/">Return home</Link>
          </Button>
        </div>
      }
      title="Reset your password"
    >
      <ForgotPasswordForm
        form={form}
        formError={formError}
        isPending={isPending}
        onSubmit={submit}
      />
    </AuthShell>
  );
}
