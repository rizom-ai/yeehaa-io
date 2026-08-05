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
    // Primary nav order. Entity nav items default to priority 40 and would
    // otherwise fall back to registration order; Agents stays at the default
    // and About sits at 90.
    post: {
      label: "Essay",
      navigation: { priority: 10 },
    },
    project: {
      label: "Project",
      navigation: { priority: 20 },
    },
    deck: {
      label: "Presentation",
      navigation: { priority: 30 },
    },
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
