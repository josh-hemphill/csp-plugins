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

The low-level merge takes a complete CSP header map and replaces the managed
CSP, reporting, and referrer fields at the selected rule. Use static artifact
merging to preserve user-managed policies and track generated rules across runs.

Use `mergeStaticHeaders` for an artifact produced by the CLI or Vite. JSON
preserves route maps. Netlify and Cloudflare Pages match clean URLs and
directory index aliases. Vercel and Firebase emit exact HTML paths and index
aliases. Use `mergeStructuredStaticHeaders` when writing Vercel or Firebase
config across builds. Store its returned `ownership` with the deployment and
use it as the fifth argument on the next run. This removes superseded rules
even after project routing settings change. Site and overlap checks reject
ambiguous merges.

```ts
const { body, ownership } = mergeStructuredStaticHeaders(
  'vercel', existingConfig, headerArtifact, { publicDir: 'dist' }, previousOwnership,
);
```
 See the [CLI guide](../cli/README.md#hosting).

The nginx, Apache, Caddy, and Express adapters emit a single-policy snippet.
Import the Express module and register its middleware before serving static
content.

```js
import { cspHeaders } from './csp-headers.middleware.mjs';

app.use(cspHeaders);
```
