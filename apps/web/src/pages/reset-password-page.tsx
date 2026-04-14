import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { useResetPasswordForm } from "@/features/auth/hooks/use-reset-password-form";

interface ResetPasswordPageProps {
  token?: string;
}

export function ResetPasswordPage({ token }: ResetPasswordPageProps) {
  const [isInvalidTokenState, setIsInvalidTokenState] = useState(false);

  if (!token) {
    return (
      <AuthShell
        badge="Recovery"
        description="The reset link is missing the token required to verify this request."
        footer={
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link to="/forgot-password">Request a new link</Link>
            </Button>
            <Button asChild className="rounded-full" variant="ghost">
              <Link to="/">Return home</Link>
            </Button>
          </div>
        }
        title="Reset link unavailable"
      >
        <Alert variant="destructive">
          <AlertTitle>Invalid reset link</AlertTitle>
          <AlertDescription>
            Request a new password reset email and use the latest link we send.
          </AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  if (isInvalidTokenState) {
    return (
      <AuthShell
        badge="Recovery"
        description="This reset link is no longer valid. Request a new one to continue."
        footer={
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link to="/forgot-password">Request a new link</Link>
            </Button>
            <Button asChild className="rounded-full" variant="ghost">
              <Link to="/login">Back to login</Link>
            </Button>
          </div>
        }
        title="Reset link expired"
      >
        <Alert variant="destructive">
          <AlertTitle>Link is invalid or expired</AlertTitle>
          <AlertDescription>
            Password reset links can only be used once and stop working after
            they expire.
          </AlertDescription>
        </Alert>
      </AuthShell>
    );
  }

  return (
    <ResetPasswordReadyPage
      onInvalidToken={() => {
        setIsInvalidTokenState(true);
      }}
      token={token}
    />
  );
}

interface ResetPasswordReadyPageProps {
  onInvalidToken: () => void;
  token: string;
}

function ResetPasswordReadyPage({
  onInvalidToken,
  token,
}: ResetPasswordReadyPageProps) {
  const navigate = useNavigate();
  const { form, formError, isPending, submit } = useResetPasswordForm({
    onInvalidToken,
    onSuccess: async () => {
      toast.success("Password updated.");
      await navigate({
        replace: true,
        to: "/login",
      });
    },
    token,
  });

  return (
    <AuthShell
      badge="Recovery"
      description="Choose a new password for your account. This reset link can only be used once."
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
      title="Choose a new password"
    >
      <ResetPasswordForm
        form={form}
        formError={formError}
        isPending={isPending}
        onSubmit={submit}
      />
    </AuthShell>
  );
}
