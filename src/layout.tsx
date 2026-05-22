import type { ComponentProps, JSX } from "preact";
import { ProfessionalLayout } from "@rizom/brain/site";

type LayoutProps = ComponentProps<typeof ProfessionalLayout>;

const wordmark = (
  <span className="inline-flex items-baseline font-heading font-medium text-[1.4rem] leading-none tracking-[-0.01em] [font-variation-settings:'opsz'_24,'SOFT'_50]">
    yeehaa
    <span className="text-accent">.</span>
    <span className="italic font-normal text-theme-light text-[0.78em] [font-variation-settings:'opsz'_24,'SOFT'_80]">
      io
    </span>
  </span>
);

export function YeehaaLayout(props: LayoutProps): JSX.Element {
  return <ProfessionalLayout {...props} wordmark={wordmark} />;
}
