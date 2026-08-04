import { professionalRoutes, type SitePackage } from "@rizom/brain/site";
import { YeehaaLayout } from "./layout";

/**
 * Local yeehaa site.
 *
 * Mirrors the old monorepo `@brains/site-yeehaa` package while using the
 * standalone local site convention.
 */
const site = {
  layouts: {
    default: YeehaaLayout,
  },
  routes: professionalRoutes,
  entityDisplay: {
    post: { label: "Essay" },
    deck: { label: "Presentation" },
    project: { label: "Project" },
    series: {
      label: "Series",
      navigation: { slot: "secondary" },
    },
    topic: {
      label: "Topic",
      navigation: { slot: "secondary" },
    },
    link: {
      label: "Link",
      navigation: { slot: "secondary" },
    },
    base: {
      label: "Note",
      navigation: { show: false },
    },
    "social-post": {
      label: "Social Post",
      pluralName: "social-posts",
      navigation: { slot: "secondary" },
    },
    newsletter: {
      label: "Newsletter",
      navigation: { slot: "secondary" },
    },
  },
} satisfies Partial<SitePackage>;

export default site;
