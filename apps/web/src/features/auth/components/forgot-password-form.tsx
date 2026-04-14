import type { FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ForgotPasswordFormValues } from "../auth-schemas";

interface ForgotPasswordFormProps {
  form: UseFormReturn<ForgotPasswordFormValues>;
  formError: string | null;
  isPending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function ForgotPasswordForm({
  form,
  formError,
  isPending,
  onSubmit,
}: ForgotPasswordFormProps) {
  const emailError = form.formState.errors.email?.message;

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="forgot-password-email">Email</Label>
        <Input
          aria-invalid={emailError ? true : undefined}
          autoComplete="email"
          disabled={isPending}
          id="forgot-password-email"
          placeholder="name@company.com"
          type="email"
          {...form.register("email")}
        />
        {emailError ? (
          <p className="text-sm text-destructive">{emailError}</p>
        ) : null}
      </div>

      <Button
        className="w-full rounded-full"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Sending reset link..." : "Send reset link"}
      </Button>
    </form>
  );
}
