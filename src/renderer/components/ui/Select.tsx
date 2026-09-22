import { cn } from "../../../lib/utils.ts";
import { Check, ChevronDown } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
  type ComponentProps,
} from "react";
import { createPortal } from "react-dom";

type Option = { value: string; label: string };
export default function Select({
  label,
  value,
  options,
  disabled,
  onChange,
  triggerClassName,
  popupClassName,
  popupStyle,
  preserveSelection = false,
  size = "sm",
  id: triggerId,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  label: string;
  value: string;
  options: readonly Option[];
  triggerClassName?: string;
  popupClassName?: string;
  popupStyle?: CSSProperties;
  preserveSelection?: boolean;
  size?: "sm" | "md";
  disabled?: boolean;
  onChange: (value: string) => void;
} & Pick<
  ComponentProps<"button">,
  "id" | "aria-describedby" | "aria-invalid"
>) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0, minWidth: 0 });
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const available = !disabled && options.length > 0;
  useLayoutEffect(() => {
    if (!available) setOpen(false);
  }, [available]);
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open || disabled || !popup.current) return;
    const element = popup.current;
    const update = () => {
      const anchor = trigger.current.getBoundingClientRect(),
        height = element.offsetHeight;
      const width = Math.max(anchor.width, element.offsetWidth);
      setPosition({
        left: Math.max(
          12,
          Math.min(anchor.left, innerWidth - width - 12),
        ),
        top: Math.max(
          12,
          anchor.bottom + 6 + height <= innerHeight - 12
            ? anchor.bottom + 6
            : anchor.top - height - 6,
        ),
        minWidth: width,
      });
    };
    update();
    element
      .querySelectorAll<HTMLButtonElement>('[role="option"]')
      .item(selected)
      ?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (
        !event.composedPath().includes(element) &&
        !event.composedPath().includes(trigger.current)
      )
        setOpen(false);
    };
    const hide = () => setOpen(false);
    const details = trigger.current.closest("details");
    const toggled = () => {
      if (!details.open) hide();
    };
    details?.addEventListener("toggle", toggled);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("blur", hide);
    return () => {
      details?.removeEventListener("toggle", toggled);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("blur", hide);
    };
  }, [open, disabled, selected]);
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") close(true);
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const items = Array.from(
        popup.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ??
          [],
      );
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus({ preventScroll: true });
      items[next]?.scrollIntoView({ block: "nearest" });
    }
  };
  return (
    <>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        className={cn(
          "ui-select-trigger",
          size === "md" &&
            "h-[42px] w-full min-w-0 border-input bg-background px-3 text-sm transition-colors aria-invalid:border-destructive disabled:opacity-60",
          triggerClassName,
        )}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={open ? id : undefined}
        disabled={disabled || options.length === 0}
        onMouseDown={(event) => {
          if (preserveSelection) event.preventDefault();
        }}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          } else if (open) keys(event);
        }}
      >
        <span className="min-w-0 truncate">
          {options[selected]?.label ?? "请选择"}
        </span>
        <ChevronDown className="shrink-0" size={15} />
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={popup}
            id={id}
            className={cn("ui-select-options", popupClassName)}
            role="listbox"
            aria-label={label}
            style={{ ...popupStyle, ...position }}
            onKeyDown={keys}
          >
            {options.map((option) => (
              <button
                type="button"
                role="option"
                data-value={option.value}
                aria-selected={value === option.value}
                key={option.value}
                tabIndex={-1}
                onClick={() => {
                  close(true);
                  if (value !== option.value) onChange(option.value);
                }}
              >
                <span>{option.label}</span>
                {value === option.value && <Check size={16} />}
              </button>
            ))}
          </div>,
          trigger.current?.closest('dialog[open], [aria-modal="true"]') ??
            document.body,
        )}
    </>
  );
}
