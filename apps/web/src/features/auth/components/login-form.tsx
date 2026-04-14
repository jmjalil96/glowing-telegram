import type { FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { LoginFormValues } from "../auth-schemas";

interface LoginFormProps {
  form: UseFormReturn<LoginFormValues>;
  formError: string | null;
  isPending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function LoginForm({
  form,
  formError,
  isPending,
  onSubmit,
}: LoginFormProps) {
  const emailError = form.formState.errors.email?.message;
  const passwordError = form.formState.errors.password?.message;

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          aria-invalid={emailError ? true : undefined}
          autoComplete="email"
          disabled={isPending}
          id="login-email"
          placeholder="name@company.com"
          type="email"
          {...form.register("email")}
        />
        {emailError ? (
          <p className="text-sm text-destructive">{emailError}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          aria-invalid={passwordError ? true : undefined}
          autoComplete="current-password"
          disabled={isPending}
          id="login-password"
          type="password"
          {...form.register("password")}
        />
        {passwordError ? (
          <p className="text-sm text-destructive">{passwordError}</p>
        ) : null}
      </div>

      <Button
        className="w-full rounded-full"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
