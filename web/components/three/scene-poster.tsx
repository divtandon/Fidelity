import Image from "next/image";

type ScenePosterProps = {
  className?: string;
};

export function ScenePoster({ className = "" }: ScenePosterProps) {
  return (
    <div className={`scene-poster ${className}`} aria-hidden="true">
      <Image src="/quantization-poster.png" alt="" fill priority quality={90} sizes="100vw" />
    </div>
  );
}
