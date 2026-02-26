const pluginBookshop = require("@bookshop/eleventy-bookshop");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const markdownIt = require("markdown-it");
const md = new markdownIt({
  html: true,
})

/* 11ty config imports */
const image_shortcode = require("./_11ty_config/image_shortcode");
const StyleRenderer = require('./src/config/style_renderer.js');
const Helpers = require('./src/config/helpers.js');

// biome-ignore lint/complexity/useArrowFunction: <explanation>
module.exports = async function (eleventyConfig) {
  const { RenderPlugin } = await import("@11ty/eleventy");

  eleventyConfig.addLiquidFilter("escapeQuotes", function (value) {
    return value.replace(/'/g, "\\'").replace(/\n/g, "\\n");
  });

  eleventyConfig.addFilter("render_padding", StyleRenderer.render_padding);
  eleventyConfig.addFilter("render_margin", StyleRenderer.render_margin);
  eleventyConfig.addFilter("render_position", StyleRenderer.render_position);
  eleventyConfig.addFilter("render_position_percentage", StyleRenderer.render_position_percentage);
  eleventyConfig.addFilter("render_transform", StyleRenderer.render_transform);
  eleventyConfig.addFilter("render_logo_transform", StyleRenderer.render_logo_transform);
  eleventyConfig.addFilter("render_text_alignment", StyleRenderer.render_text_alignment);
  eleventyConfig.addFilter("render_heading_text_size", StyleRenderer.render_heading_text_size);
  eleventyConfig.addFilter("render_text_block_text_size", StyleRenderer.render_text_block_text_size);
  eleventyConfig.addFilter("render_sub_text_block_text_size", StyleRenderer.render_sub_text_block_text_size);
  eleventyConfig.addFilter("render_justify", StyleRenderer.render_justify);
  eleventyConfig.addFilter("render_spacer", StyleRenderer.render_spacer);
  eleventyConfig.addFilter("render_block_alignment", StyleRenderer.render_block_alignment);
  eleventyConfig.addFilter("render_visibility", StyleRenderer.render_visibility);
  eleventyConfig.addFilter("render_columns", StyleRenderer.render_columns);
  eleventyConfig.addFilter("render_three_columns", StyleRenderer.render_three_columns);
  eleventyConfig.addFilter("render_vertical_block_alignment", StyleRenderer.render_vertical_block_alignment);
  eleventyConfig.addFilter("UUID", Helpers.uuid);
  eleventyConfig.addFilter("markdownify", (markdown) => md.render(markdown));

  eleventyConfig.addPassthroughCopy("src/assets/images");
  eleventyConfig.addPassthroughCopy("src/assets/videos");
  eleventyConfig.addPassthroughCopy("src/assets/documents");
  eleventyConfig.addPassthroughCopy("src/assets/scripts");
  eleventyConfig.addPassthroughCopy(
    "node_modules/@fortawesome/fontawesome-free/css/all.min.css"
  );
  eleventyConfig.addPassthroughCopy(
    "node_modules/@fortawesome/fontawesome-free/webfonts"
  );
  eleventyConfig.addPassthroughCopy(
    "node_modules/@11ty/eleventy"
  );

  eleventyConfig.addWatchTarget("tailwind.config.js");
  eleventyConfig.addWatchTarget("src/assets/styles/**/*.{css,scss}");
  eleventyConfig.addWatchTarget("component-library/");

  eleventyConfig.addPlugin(
    pluginBookshop({
      bookshopLocations: ["component-library"],
      pathPrefix: "",
    })
  );

  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(RenderPlugin);

  // Custom Shortcodes
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);
  eleventyConfig.addShortcode("image", image_shortcode);
  eleventyConfig.addPairedLiquidShortcode(
    "tint",
    function (content, tint_color) {
      return `<span style="color: ${tint_color}">${content}</span>`;
    }
  );

  // Custom Collection
  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/pages/blog/**/*.md");
  });

  return {
    dir: {
      input: "src",
      output: "_site",
    },
  };
};
