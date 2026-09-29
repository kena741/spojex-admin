import { initials } from "@/lib/utils";

export function UserAvatar({
  name,
  src,
  size = 36,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
}) {
  const label = initials(name);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "Avatar"}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid place-items-center rounded-full bg-primary/10 font-heading text-xs font-semibold text-primary"
      style={{ width: size, height: size }}
    >
      {label}
    </span>
  );
}
