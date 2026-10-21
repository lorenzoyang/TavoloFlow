import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { messages as m } from "./messages";

type PasswordInputProps = {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minimum?: number;
  description?: string;
  error?: string;
  disabled?: boolean;
  onChange?: () => void;
};

export function PasswordInput({ name, label, autoComplete, minimum, description, error, disabled, onChange }: PasswordInputProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [description && descriptionId, error && errorId].filter(Boolean).join(" ") || undefined;
  return (
    <Field data-invalid={!!error} data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input id={id} name={name} type={visible ? "text" : "password"}
          required minLength={minimum} maxLength={128} autoComplete={autoComplete}
          disabled={disabled} aria-invalid={!!error} aria-describedby={describedBy}
          onChange={onChange} className="h-11 pr-12" />
        <Button type="button" variant="ghost" size="icon" disabled={disabled}
          onClick={() => setVisible(!visible)}
          aria-label={`${visible ? m.hidePassword : m.showPassword}：${label}`} aria-pressed={visible}
          className="absolute right-0 top-0 size-11 text-muted-foreground">
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
