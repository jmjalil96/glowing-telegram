import type { FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ResetPasswordFormValues } from "../auth-schemas";

interface ResetPasswordFormProps {
  form: UseFormReturn<ResetPasswordFormValues>;
  formError: string | null;
  isPending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function ResetPasswordForm({
  form,
  formError,
  isPending,
  onSubmit,
}: ResetPasswordFormProps) {
  const passwordError = form.formState.errors.password?.message;
  const confirmPasswordError = form.formState.errors.confirmPassword?.message;

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Password reset failed</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="reset-password-password">New password</Label>
        <Input
          aria-invalid={passwordError ? true : undefined}
          autoComplete="new-password"
          disabled={isPending}
          id="reset-password-password"
          type="password"
          {...form.register("password")}
        />
        {passwordError ? (
          <p className="text-sm text-destructive">{passwordError}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="reset-password-confirm-password">
          Confirm password
        </Label>
        <Input
          aria-invalid={confirmPasswordError ? true : undefined}
          autoComplete="new-password"
          disabled={isPending}
          id="reset-password-confirm-password"
          type="password"
          {...form.register("confirmPassword")}
        />
        {confirmPasswordError ? (
          <p className="text-sm text-destructive">{confirmPasswordError}</p>
        ) : null}
      </div>

      <Button
        className="w-full rounded-full"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Updating password..." : "Update password"}
      </Button>
    </form>
  );
}
