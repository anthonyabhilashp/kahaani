import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { showValue?: boolean }
>(({ className, showValue, ...props }, ref) => {
  const value = props.value?.[0] || props.defaultValue?.[0] || 0;

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center cursor-pointer py-3",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gray-700 cursor-pointer">
        <SliderPrimitive.Range className="absolute h-full bg-orange-600" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-8 w-8 rounded-full bg-orange-500 shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 disabled:pointer-events-none disabled:opacity-50 hover:scale-105 cursor-grab active:cursor-grabbing active:scale-100 flex items-center justify-center text-white font-bold text-sm">
        {showValue && value}
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
