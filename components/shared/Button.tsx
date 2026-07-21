import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "icon";

export type ButtonSize = "sm" | "md" | "lg" | "icon-sm" | "icon-md" | "icon-lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const baseClasses =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:pointer-events-none disabled:cursor-default disabled:opacity-40 disabled:active:scale-100";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/60",
  outline:
    "border border-border bg-background text-foreground hover:border-ring/50 hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
  ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
  destructive:
    "text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20",
  icon: "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3 text-sm",
  lg: "h-10 px-4 text-sm",
  "icon-sm": "h-6 w-6 text-xs",
  "icon-md": "h-7 w-7 text-sm",
  "icon-lg": "h-9 w-9 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "ghost",
      size = variant === "icon" ? "icon-md" : "md",
      type = "button",
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  )
);

Button.displayName = "Button";
