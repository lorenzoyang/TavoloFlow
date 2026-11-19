import { useCallback, useState, type ReactNode } from "react";
import type { Language } from "@/lib/language";
import type { OnlineMenu } from "./api";
import { TurnstileChallenge } from "./TurnstileChallenge";
import type { useOnlineCart } from "./useOnlineCart";
import {
  verificationBinding,
  verificationContext,
  verificationToken,
  type VerificationProof,
} from "./verification";

// The security check in front of a submission, shared by the checkout page and the cart's retry of an
// unknown result. A proof binds the restaurant and the request ID and is spent by one attempt: every
// attempt, successful or not, renders a fresh challenge.
export function useVerification(
  model: ReturnType<typeof useOnlineCart>,
  data: OnlineMenu,
  language: Language,
  fallback: ReactNode,
) {
  const [proof, setProof] = useState<VerificationProof | null>(null);
  const [attempt, setAttempt] = useState(0);
  const siteKey = data.turnstile?.siteKey ?? null;
  const binding =
    siteKey && model.verificationRequestId
      ? verificationBinding(data.restaurant.id, model.verificationRequestId)
      : null;
  const context = siteKey && binding ? verificationContext(siteKey, binding, language) : "";
  const token = verificationToken(proof, context);
  const reset = useCallback(() => {
    setProof(null);
    setAttempt((value) => value + 1);
  }, []);
  async function submit(retry: boolean) {
    try {
      await (retry ? model.retry(token) : model.confirm(token));
    } finally {
      reset();
    }
  }
  const challenge =
    siteKey && binding ? (
      <TurnstileChallenge
        key={`${context}:${attempt}`}
        siteKey={siteKey}
        binding={binding}
        language={language}
        onProof={setProof}
        retry={reset}
        fallback={fallback}
      />
    ) : null;
  // Whether a submission still waits for its proof.
  const verifying = !!siteKey && !token;
  return { challenge, verifying, submit };
}
