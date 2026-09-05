import Image from "next/image";

type LogoMarkProps = { className?: string };

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <Image
      aria-hidden="true"
      className={className}
      src="/fidelity-orbit-mark.png"
      alt=""
      width={72}
      height={72}
      sizes="72px"
      draggable={false}
    />
  );
}
