import { zodResolver } from "@hookform/resolvers/zod";
import type { FormEventHandler } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { applyAuthFormError } from "@/features/auth/auth-errors";
import {
  forgotPasswordFormSchema,
  type ForgotPasswordFormValues,
} from "@/features/auth/auth-schemas";
import { useForgotPasswordMutation } from "@/features/auth/auth-query";

interface UseForgotPasswordFormOptions {
  onSuccess: () => Promise<void> | void;
}

export function useForgotPasswordForm({
  onSuccess,
}: UseForgotPasswordFormOptions) {
  const form = useForm<ForgotPasswordFormValues>({
    defaultValues: {
      email: "",
    },
    resolver: zodResolver(forgotPasswordFormSchema),
  });
  const forgotPasswordMutation = useForgotPasswordMutation();
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors();
    setFormError(null);

    try {
      await forgotPasswordMutation.mutateAsync(values);
      await onSuccess();
    } catch (error) {
      const appliedError = applyAuthFormError({
        allowedFieldNames: ["email"],
        error,
        knownCodes: [],
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
    isPending: forgotPasswordMutation.isPending,
    submit,
  };
}
