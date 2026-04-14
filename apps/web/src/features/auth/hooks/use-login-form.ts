import { zodResolver } from "@hookform/resolvers/zod";
import type { FormEventHandler } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  applyAuthFormError,
  loginBusinessErrorCodes,
} from "@/features/auth/auth-errors";
import {
  loginFormSchema,
  type LoginFormValues,
} from "@/features/auth/auth-schemas";
import { useLoginMutation } from "@/features/auth/auth-query";

interface UseLoginFormOptions {
  onSuccess: () => Promise<void> | void;
}

export function useLoginForm({ onSuccess }: UseLoginFormOptions) {
  const form = useForm<LoginFormValues>({
    defaultValues: {
      email: "",
      password: "",
    },
    resolver: zodResolver(loginFormSchema),
  });
  const loginMutation = useLoginMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors();
    setFormError(null);

    try {
      await loginMutation.mutateAsync(values);
      await onSuccess();
    } catch (error) {
      const appliedError = applyAuthFormError({
        allowedFieldNames: ["email", "password"],
        error,
        knownCodes: loginBusinessErrorCodes,
        setError: form.setError,
      });

      setFormError(appliedError.message);
    }
  });
  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    void handleSubmit(event);
  };

  return {
    form,
    formError,
    isPending: loginMutation.isPending,
    submit,
  };
}
