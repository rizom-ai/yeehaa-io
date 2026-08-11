import type { SiteDefinitionOverrides } from "@rizom/site";

/**
 * Local yeehaa site.
 *
 * Layers Yeehaa's entity labels and navigation order over the explicit
 * `@brains/site-default` base selected in brain.yaml. The base continues to
 * own the professional routes and layout.
 */
const site = {
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
} satisfies SiteDefinitionOverrides;

export default site;
