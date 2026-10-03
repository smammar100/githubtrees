import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus-outlineColor) disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primer "primary"
        default:
          "border-(--button-primary-borderColor-rest) bg-(--button-primary-bgColor-rest) text-(--button-primary-fgColor-rest) shadow-resting hover:border-(--button-primary-borderColor-hover) hover:bg-(--button-primary-bgColor-hover) active:bg-(--button-primary-bgColor-active)",
        // Primer "default"
        outline:
          "border-(--button-default-borderColor-rest) bg-(--button-default-bgColor-rest) text-(--button-default-fgColor-rest) shadow-(--button-default-shadow-resting) hover:border-(--button-default-borderColor-hover) hover:bg-(--button-default-bgColor-hover) active:bg-(--button-default-bgColor-active) aria-expanded:bg-(--button-default-bgColor-selected)",
        secondary:
          "border-(--button-default-borderColor-rest) bg-(--button-default-bgColor-rest) text-(--button-default-fgColor-rest) shadow-(--button-default-shadow-resting) hover:border-(--button-default-borderColor-hover) hover:bg-(--button-default-bgColor-hover) active:bg-(--button-default-bgColor-active) aria-expanded:bg-(--button-default-bgColor-selected)",
        // Primer "invisible"
        ghost:
          "border-(--button-invisible-borderColor-rest) bg-(--button-invisible-bgColor-rest) text-(--button-invisible-fgColor-rest) hover:bg-(--button-invisible-bgColor-hover) active:bg-(--button-invisible-bgColor-active) aria-expanded:bg-(--button-invisible-bgColor-hover)",
        // Primer "danger"
        destructive:
          "border-(--button-danger-borderColor-rest) bg-(--button-danger-bgColor-rest) text-(--button-danger-fgColor-rest) shadow-(--button-default-shadow-resting) hover:border-(--button-danger-borderColor-hover) hover:bg-(--button-danger-bgColor-hover) hover:text-(--button-danger-fgColor-hover) active:bg-(--button-danger-bgColor-active)",
        link: "border-transparent text-fg-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-(--control-medium-size) px-(--control-medium-paddingInline-normal)",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-(--control-small-size) gap-1 px-(--control-small-paddingInline-condensed) text-xs",
        lg: "h-(--control-large-size) px-(--control-large-paddingInline-normal)",
        icon: "size-8",
        "icon-xs": "size-6",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
