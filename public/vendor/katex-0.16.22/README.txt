KaTeX 0.16.22

Source: the project's installed katex@0.16.22 package (https://katex.org/).
License: MIT; see LICENSE in this directory.

The browser bundle, stylesheet, and all fonts referenced by the stylesheet are
copied unchanged from the package's dist directory. These files support the
standalone pseudocode examples under public/posts/StaticAnalytics/ without an
external CDN connection. They do not change the main blog's typography.

Keep the browser bundle, CSS, and fonts at the same version when updating.
The pseudocode examples import this directory using relative URLs, so the
examples can also be opened from a local copy of the public directory.
