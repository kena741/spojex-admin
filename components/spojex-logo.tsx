import Image from "next/image";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/images/logo-transparent.png";

export function SpojexLogo({
  size = 32,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={LOGO_SRC}
      alt="SpoJex"
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 rounded-lg object-cover", className)}
    />
  );
}
