# CSP CLI

Process the final directory you deploy. The CLI scans HTML for inline scripts
and styles, adds a CSP meta tag, and writes the HTTP header values. It works
directly on static HTML and can also use a bundler manifest for processor
options. This workspace CLI is unpublished.

Build the workspace with `pnpm build:all`. From your site's project directory,
invoke the built executable.

```sh
node /path/to/csp-plugins/packages/cli/dist/cli.mjs dist
node /path/to/csp-plugins/packages/cli/dist/cli.mjs dist --emit netlify
node /path/to/csp-plugins/packages/cli/dist/cli.mjs dist --no-html --emit vercel
```

## Options

| Option | Behavior |
| --- | --- |
| `--output-dir <directory>` | Copy processed files and publish-directory artifacts there. Relative paths use the current working directory. Start each deployment with a clean output directory. |
| `--base <path>` | Deployment URL prefix, such as `/site/`. The CLI reuses Vite build metadata, a saved deployment base, or a uniquely matching existing route map. Defaults to `/`. |
| `--project-dir <directory>` | Directory for Vercel or Firebase project config and generated rule state. Defaults to the current working directory. |
| `--headers-output <file>` | Override the JSON destination. Defaults to `csp-headers.json` in the publish directory. |
| `--no-html` | Analyze HTML and emit headers without rewriting it. Use this for an existing baked policy or inline hashes. |
| `--replace-existing` | Replace an authored or Vite-generated CSP meta tag. By default the CLI preserves and exports those policies. A policy file can replace generated metadata, and replacing an authored policy requires this flag. |
| `--no-headers` | Skip default JSON generation. Explicit `--emit` choices still apply. |
| `--local-script-integrity` | Add SRI to resolvable same-site external scripts. Local stylesheet SRI is enabled by default. Hashes use the original file bytes. |
| `--manifests-dir <directory>` | Directory to load plugin options from. Defaults to `.csp-manifest`. Only manifests for the selected input directory can supply policy options. |
| `--auto-manifest` | Scan for manifest data when a build manifest is unavailable. Plain static policy generation works without this flag. |
| `--csp-policy-file <file>` | Custom base policy JSON. Use the processor's `baseDirectives` shape, such as `{"CSP":{"img-src":["self","data:"]}}`. |
| `--log-level <level>` | Set verbosity. Use `--help` for cache maintenance flags and additional details. |

A one-page site deployed at `/` receives a flat JSON header map. Multi-page and
mounted sites receive a `routes` object keyed by the emitted HTML paths. Meta tags remain
page-specific in either mode. Browser requests that reach the same HTML via
custom rewrites or clean URLs need a corresponding deployment header rule.
Local integrity is derived from files under the static directory. When integrity checking is enabled, at least one of the strongest supplied SRI pins must match the file bytes. Remote asset
integrity should be specified explicitly in your markup. For HTML using a
`<base>` element, the CLI resolves a relative base under `base-uri 'self'`
and ignores it under `base-uri 'none'`. It reports a conflict if the
effective base would depend on a deployment origin it cannot know. A generated
CSP meta tag must precede the base element when it sets `base-uri`. When a host
adds or removes a trailing slash, use root-relative script and stylesheet paths
so the same HTML works at each published URL.

## Hosting

| Adapter | Destination | Multi-page policies |
| --- | --- | --- |
| `json` | Publish directory | Per HTML path. |
| `netlify`, `cloudflare-pages` | Publish directory, `_headers` | Exact HTML paths, clean paths such as `/about`, and directory index aliases such as `/docs/`. Static assets only. |
| `vercel` | Project directory, `vercel.json` | Exact paths, directory indexes, and canonical URLs derived from project settings. A conflicting existing CSP rule or output directory stops generation. |
| `firebase` | Project directory, `firebase.json` | Exact HTML paths and directory index aliases. An existing multi-site config must have exactly one site matching the publish directory. |
| `nginx`, `apache`, `caddy`, `express` | Publish directory, server snippet (Express uses an ES module) | One policy per snippet. For distinct routes, use the JSON and attach policies in server configuration. |

Review native files before deploying. For structured project configs,
`.csp-headers-state.json` records the generated policy values so later runs can
remove stale generated rules while preserving unrelated existing settings.
Keep this file alongside the project config between runs. The CLI owns the CSP
fields in its JSON output and preserves other response headers in that file.
The generated `.csp-headers-base.json` beside the pages keeps their deployment
base stable across page additions and removals. Keep it in the publish
directory when rerunning with a separate output directory. For Netlify and
Cloudflare Pages, generated rules live in a marked block in `_headers`.

The CLI uses inline hashes for static pages. Existing user configuration can
restrict or extend the default sources. Runtime-generated HTML and per-request
nonces require integration at the server.
