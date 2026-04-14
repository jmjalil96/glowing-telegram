import { zodResolver } from "@hookform/resolvers/zod";
import type { FormEventHandler } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  applyAuthFormError,
  hasApiErrorCode,
  hasValidationErrorForField,
  resetBusinessErrorCodes,
} from "@/features/auth/auth-errors";
import {
  resetPasswordFormSchema,
  type ResetPasswordFormValues,
} from "@/features/auth/auth-schemas";
import { useResetPasswordMutation } from "@/features/auth/auth-query";

interface UseResetPasswordFormOptions {
  onInvalidToken: () => void;
  onSuccess: () => Promise<void> | void;
  token: string;
}

export function useResetPasswordForm({
  onInvalidToken,
  onSuccess,
  token,
}: UseResetPasswordFormOptions) {
  const form = useForm<ResetPasswordFormValues>({
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
    resolver: zodResolver(resetPasswordFormSchema),
  });
  const resetPasswordMutation = useResetPasswordMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors();
    setFormError(null);

    const submittedToken = token;

    try {
      await resetPasswordMutation.mutateAsync({
        password: values.password,
        token: submittedToken,
      });
      await onSuccess();
    } catch (error) {
      if (
        hasApiErrorCode(error, "INVALID_RESET_TOKEN") ||
        hasValidationErrorForField(error, "token")
      ) {
        onInvalidToken();
        return;
      }

      const appliedError = applyAuthFormError({
        allowedFieldNames: ["password"],
        error,
        knownCodes: resetBusinessErrorCodes,
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
    isPending: resetPasswordMutation.isPending,
    submit,
  };
}
