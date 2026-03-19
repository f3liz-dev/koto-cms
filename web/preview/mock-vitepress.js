import { computed, h, ref } from "vue";

export function useData() {
  return {
    site: ref({
      title: "My Docs",
      description: "",
      themeConfig: {
        nav: [],
        sidebar: [],
      },
    }),
    theme: ref({}),
    page: ref({
      title: "Preview",
      description: "",
      frontmatter: {},
      headers: [],
      relativePath: "index.md",
    }),
    frontmatter: ref({}),
    lang: ref("en-US"),
    localePath: ref("/"),
    title: computed(() => "Preview"),
    description: ref(""),
    isDark: ref(false),
  };
}

export function useRoute() {
  return {
    path: "/preview",
    data: {
      frontmatter: {},
    },
    component: null,
  };
}

export function useRouter() {
  return {
    route: useRoute(),
    go: async (href) => {
      console.log("[mock router] navigate to:", href);
    },
  };
}

export function withBase(path) {
  return path;
}

export const inBrowser = true;

export const Content = {
  name: "Content",
  render() {
    return h("div", { class: "vp-doc" }, "[Content slot]");
  },
};
