import Image from "next/image";

const BANNER_SRC = "/brand/akshar-logo-banner.png";

export type BrandLogoVariant = "sidebar" | "login" | "card";

export function BrandLogo({ variant }: { variant: BrandLogoVariant }) {
  if (variant === "sidebar") {
    return (
      <div className="relative h-12 w-full shrink-0">
        <Image
          src={BANNER_SRC}
          alt="Akshar Travels"
          width={588}
          height={166}
          className="h-12 w-full object-contain object-left"
          priority
          sizes="224px"
        />
      </div>
    );
  }

  if (variant === "login") {
    return (
      <div className="relative mx-auto mb-8 h-[4.5rem] w-full max-w-[min(100%,320px)]">
        <Image
          src={BANNER_SRC}
          alt="Akshar Travels"
          width={588}
          height={166}
          className="h-[4.5rem] w-full object-contain object-center"
          priority
          sizes="320px"
        />
      </div>
    );
  }

  return (
    <div className="relative mx-auto mb-5 h-14 w-full max-w-[280px]">
      <Image
        src={BANNER_SRC}
        alt="Akshar Travels"
        width={588}
        height={166}
        className="h-14 w-full object-contain object-center"
        sizes="280px"
      />
    </div>
  );
}
