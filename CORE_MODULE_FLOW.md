# CSP Core Module Flow and Usage Patterns

This diagram explains how the CSP Core Module works and the different ways it can be integrated into build processes.

## Architecture Overview

```mermaid
graph LR
    %% Entry Points
    subgraph "Entry Points"
        A[Build Plugin - Vite/Webpack/Rollup]
        H[Server/Static Host]
    end

    %% Core Processing
    subgraph "Core Processing"
        B[CSPProcessor.processHTML]
        C[Parse HTML to DOM]
        D[Analyze DOM Structure]
        E[Generate CSP Directives]
        F[Inject Nonces/Hashes]
        G[Return Modified HTML + CSP Headers]
    end

    %% Core Components
    subgraph "Core Module Components"
        O[CSPProcessor - Main Orchestrator]
        P[ExternalResourceManager - Resource Fetching & Hashing]
        Q[Crypto Utilities - Nonce & Hash Generation]
        R[CspDirectives - Type-Safe CSP Builder]
    end

    %% Data Flow
    subgraph "Data Processing Pipeline"
        S[HTML Input]
        T[DOM Document]
        U[Analysis Result - Inline Scripts/Styles/External Sources]
        V[CSP Directives - Script-src, Style-src, etc.]
        W[Modified HTML - Nonces & Integrity Attributes]
        X[CSP Headers - Content-Security-Policy]
    end

    %% External Resource Handling
    subgraph "External Resource Processing"
        Y[External URLs]
        Z[Source Classification - Local/Remote/Data]
        AA[Pattern Matching - Include/Exclude Rules]
        BB[Resource Fetching - Optional Network Requests]
        CC[Hash Generation - Integrity Attributes]
    end

    %% Flow Connections
    A --> B
    H --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G

    S --> T
    T --> U
    U --> V
    V --> W
    V --> X

    Y --> Z
    Z --> AA
    AA --> BB
    BB --> CC

    %% Component Connections
    O --> P
    O --> Q
    O --> R

    %% Styling
    classDef entryPoint fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef coreProcessing fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef coreComponent fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef dataFlow fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef externalResource fill:#fce4ec,stroke:#880e4f,stroke-width:2px

    class A,H entryPoint
    class B,C,D,E,F,G coreProcessing
    class O,P,Q,R coreComponent
    class S,T,U,V,W,X dataFlow
    class Y,Z,AA,BB,CC externalResource
```

## Usage Patterns

### 1. Build Plugin Integration (Recommended)

**When to use:** During the build process when you have access to source files and build context.

**Benefits:**

  - Access to local file system
  - Can fetch and hash external resources
  - Generates integrity attributes
  - Optimized for build-time processing

**Example:**

```typescript
import { CSPProcessor } from '@csp-plugins/core';

const processor = new CSPProcessor({
 enableNonces: true,
 enableHashes: true,
 externalSources: {
  hashing: {
   scripts: true,
   styles: true,
   fetchExternal: true
  }
 }
});

// In your build plugin
const result = await processor.processHTML(htmlContent);
// result.html - Modified HTML with nonces
// result.headers - CSP headers for your server
```

### 2. Post-Build Processing (Runtime)

**When to use:** When you need to process HTML after it's been built, such as in a server or static hosting environment.

**Benefits:**

  - Works with any HTML output
  - Can handle dynamic content
  - No build tool dependencies

**Example:**

```typescript
import { CSPProcessor } from '@csp-plugins/core';

const processor = new CSPProcessor({
 enableNonces: true,
 enableHashes: true,
 externalSources: {
  hashing: {
   scripts: false, // Don't fetch external resources at runtime
   styles: false
  }
 }
});

// In your server
app.get('/', async(req, res) => {
 const html = await getBuiltHTML();
 const result = await processor.processHTML(html);
 res.set(result.headers);
 res.send(result.html);
});
```

## Key Components

### CSPProcessor

  - **Main orchestrator** that coordinates all CSP operations
  - **Build-time friendly** with external resource fetching capabilities
  - **Runtime safe** when external fetching is disabled

### ExternalResourceManager

  - **Source classification** (local, remote, data URLs)
  - **Pattern-based filtering** for include/exclude rules
  - **Resource fetching** with retry logic and caching
  - **Local file resolution** for build plugins

### Crypto Utilities

  - **Nonce generation** for inline scripts/styles
  - **Hash generation** for content integrity
  - **Cross-platform** (Node.js and browser compatible)

### CspDirectives

  - **Type-safe CSP directive building**
  - **Header generation** for server integration
  - **Policy validation** and error checking

## Configuration Options

### Build Plugin Optimizations

```typescript
{
  externalSources: {
    hashing: {
      scripts: true,
      styles: true,
      fetchExternal: true, // Enable for build-time
      integrity: true      // Add integrity attributes
    },
    resourceManager: {
      local: {
        resolver: (src, baseDir) => resolvePath(src, baseDir),
        exists: (path) => checkFileExists(path),
        reader: (path) => readFileContent(path)
      }
    }
  }
}
```

### Runtime Optimizations

```typescript
{
  externalSources: {
    hashing: {
      scripts: false,  // Disable external fetching
      styles: false,
      fetchExternal: false
    }
  },
  enableNonces: true,  // Still generate nonces
  enableHashes: true   // Still hash inline content
}
```

## Integration Points

### Build Tools

  - **Vite**: Use in `transformIndexHtml` hook
  - **Webpack**: Use in `HtmlWebpackPlugin` processing
  - **Rollup**: Use in `@rollup/plugin-html` processing
  - **Unplugin**: Create custom plugin wrapper

### Server Frameworks

  - **Express**: Set headers and serve modified HTML
  - **Fastify**: Use in response hooks
  - **Next.js**: Use in `getServerSideProps` or API routes
  - **Static Hosting**: Pre-process HTML files

This architecture allows you to choose the right integration pattern based on your build setup and runtime requirements.
