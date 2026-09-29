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
  // The authored opening: the atlas homepage and its contact door.
  pluginConfig: { homepageOpening: true },
  // Plain words in the header and footer instead of spaced monospace
  // capitals, and a slim bar on a phone, where the screen is short.
  themeOverride: `
.nav-link { font-family: var(--font-body); font-size: .95rem; font-weight: 400; letter-spacing: 0; text-transform: none; }
footer .font-mono.uppercase { font-family: var(--font-body); font-size: .8rem; letter-spacing: 0; text-transform: none; }
@media (max-width: 47.99rem) {
  header.sticky { padding-block: .6rem; }
  #mobile-menu-button { padding: .35rem; }
  #mobile-menu-button svg { width: 1.25rem; height: 1.25rem; }
}
`,
} satisfies SiteDefinitionOverrides & {
  pluginConfig: { homepageOpening: boolean };
};

export default site;
