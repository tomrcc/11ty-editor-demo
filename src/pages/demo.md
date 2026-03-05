---
title: Editor Demo
seo:
  page_description: >-
    Try CloudCannon's Source Editable Regions on real websites. Edit headings
    in the visual preview and watch the source code update in real time.
  no_index: false
layout: layouts/component-page.html
permalink: /demo/
eleventyExcludeFromCollections: true
content_blocks:
  - _bookshop_name: interactive-source-demo
    content:
      heading:
        _bookshop_name: simple/heading
        content:
          text: See your changes in real time ⤵
        styles:
          element: h2
          width: normal
          desktop:
            text_alignment:
              align: left
            text_sizing:
              text_size: normal
            margin:
              top: 0
              bottom: 0
          tablet:
            text_alignment:
              active: false
              align: center
            text_sizing:
              active: false
              text_size: big
            margin:
              active: false
              top: 0
              bottom: 0
          mobile:
            text_alignment:
              active: false
              align: center
            text_sizing:
              active: false
              text_size: big
            margin:
              active: false
              top: 0
              bottom: 0
      heading_description:
        _bookshop_name: simple/text-block
        content:
          text_markdown: >-
            Click **\+ Add Content Block** above to test-drive our
            Visual Editor.


            &nbsp;
        styles:
          width: large
          desktop:
            text_alignment:
              align: left
            text_sizing:
              text_size: normal
            margin:
              top: 0
              bottom: 30
            block_alignment:
              align_block: left
          tablet:
            text_alignment:
              active: false
              align: left
            text_sizing:
              active: false
              text_size: normal
            margin:
              active: false
              top: 0
              bottom: 0
            block_alignment:
              active: false
              align_block: left
          mobile:
            text_alignment:
              active: false
              align: left
            text_sizing:
              active: false
              text_size: normal
            margin:
              active: false
              top: 0
              bottom: 0
            block_alignment:
              active: false
              align_block: left
      navigation:
        header_image: https://cc-dam.imgix.net/Example-nav-1.svg
        footer_image: https://cc-dam.imgix.net/Footer.svg
      page:
        title: Edit this headline
        description: >-
          This is a simple page with hard-coded content.
          No frontmatter here!
        button_text: Find out more
        hero_image: https://cc-dam.imgix.net/hero-example-demo-image.svg
    style:
      display_heading: true
      display_heading_description: true
---
