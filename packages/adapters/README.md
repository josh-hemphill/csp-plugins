# `@csp-plugins/adapters`

Emit a `CspDirectiveHeaders` map as native config for common hosts and servers. Adapters only format headers; they do not fetch HTML or invent a second JSON schema.

```ts
import { emitAdapter, getAdapter } from '@csp-plugins/adapters';

const body = emitAdapter('netlify', headers);
const merged = getAdapter('vercel').merge(existingVercelJson, headers);
```

| id | File | Format |
| --- | --- | --- |
| `json` | `csp-headers.json` | Header map, empty values omitted |
| `netlify` / `cloudflare-pages` | `_headers` | Path block |
| `vercel` | `vercel.json` | `headers` array |
| `firebase` | `firebase.json` | `hosting.headers` |
| `nginx` | `csp-headers.nginx.conf` | `add_header ... always` |
| `apache` | `csp-headers.apache.conf` | `Header always set` |
| `caddy` | `Caddyfile.csp` | `header { }` |
| `express` | `csp-headers.middleware.mjs` | `res.setHeader` middleware |

Merge keeps unrelated keys (or `_headers` paths) and replaces only CSP-related header names.

Use `mergeStaticHeaders` for an artifact produced by the CLI or Vite. JSON
preserves route maps. Netlify and Cloudflare Pages match clean URLs and
directory index aliases. Vercel and Firebase emit exact HTML paths and index
aliases. Pass a previously generated artifact when renewing structured config
so superseded generated entries are removed. Site and overlap checks reject
ambiguous merges. See the [CLI guide](../cli/README.md#hosting).

The nginx, Apache, Caddy, and Express adapters emit a single-policy snippet.
Import the Express module and register its middleware before serving static
content.

```js
import { cspHeaders } from './csp-headers.middleware.mjs';

app.use(cspHeaders);
```
