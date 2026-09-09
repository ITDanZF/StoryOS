import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "../../../lib/utils.ts";

const control =
  "w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/10 aria-invalid:border-destructive disabled:opacity-60";
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(control, "h-[42px]", className)} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(control, "min-h-28 resize-y py-2.5 leading-6", className)}
    />
  );
}
export function NativeSelect({
  className,
  ...props
}: ComponentProps<"select">) {
  return <select {...props} className={cn(control, "h-[42px]", className)} />;
}
type FieldControl = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};
export function FormField({
  id: suppliedId,
  label,
  description,
  error,
  className,
  children,
}: {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  className?: string;
  children: (control: FieldControl) => ReactNode;
}) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const describedBy =
    [description && `${id}-help`, error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {description && (
        <p
          id={`${id}-help`}
          className="text-xs leading-5 text-muted-foreground"
        >
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
