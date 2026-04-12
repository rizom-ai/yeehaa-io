import {
  ProfessionalLayout,
  professionalRoutes,
  professionalSitePlugin,
  type SitePackage,
} from "@rizom/brain/site";

/**
 * Local yeehaa site.
 *
 * Mirrors the old monorepo `@brains/site-yeehaa` package while using the
 * standalone local site convention.
 */
const site: SitePackage = {
  layouts: {
    default: ProfessionalLayout,
  },
  routes: professionalRoutes,
  plugin: (config) => professionalSitePlugin(config ?? {}),
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
};

export default site;
