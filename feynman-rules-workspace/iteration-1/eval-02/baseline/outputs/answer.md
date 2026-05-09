# What Happens When You Type a URL and Hit Enter

## Stage 1: URL Parsing and DNS Resolution

The browser first parses the URL into its components: scheme (https), host (example.com), port, path, and query string. It then needs to translate the human-readable hostname into an IP address. It checks several caches in order — browser cache, OS cache, router cache — and if none have the answer, it asks a DNS resolver (usually your ISP's). The resolver walks the DNS hierarchy (root → TLD → authoritative nameserver) until it returns an IP like `93.184.216.34`.

## Stage 2: TCP Connection and TLS Handshake

With the IP in hand, the browser opens a TCP connection to the server on the appropriate port (443 for HTTPS). This involves the three-way handshake: SYN → SYN-ACK → ACK. For HTTPS, a TLS handshake follows: the client and server negotiate a cipher suite, the server presents its certificate (which the browser validates against trusted CAs), and they derive a shared symmetric key for encrypting the rest of the session. Modern stacks may use TLS 1.3 (one round trip) or QUIC/HTTP/3 (which folds transport and crypto together).

## Stage 3: HTTP Request and Server Response

The browser sends an HTTP request — typically `GET /path HTTP/2` — along with headers (User-Agent, Accept, Cookies, etc.). The request hits the server (often through load balancers, CDNs, and reverse proxies first). The server's application logic processes the request: it may query a database, render a template, or serve a static file. It returns a response with a status code (200, 301, 404, 500…), response headers, and a body, usually HTML.

## Stage 4: Parsing, Critical Resources, and the Render Tree

The browser begins parsing the HTML into the DOM (Document Object Model) as bytes arrive — it doesn't wait for the full document. As it encounters `<link>`, `<script>`, and `<img>` tags, it kicks off additional requests for CSS, JavaScript, fonts, and images (often in parallel, subject to per-origin connection limits). CSS is parsed into the CSSOM. Synchronous scripts block parsing; `async`/`defer` scripts don't. Once DOM and CSSOM are ready, they combine into the render tree.

## Stage 5: Layout, Paint, and Composite

With the render tree built, the browser performs **layout** (computing each element's position and size), then **paint** (filling pixels for text, colors, borders, images), and finally **composite** (assembling layers, often on the GPU, into the final frame shown on screen). The first meaningful frame is what users perceive as the page "loading." JavaScript may continue to mutate the DOM and trigger further layout/paint cycles.

## Stage 6: Post-Load Activity

After the initial render, the page is far from idle. Deferred scripts execute, service workers may register, analytics beacons fire, lazy-loaded images stream in as you scroll, and any open WebSocket or fetch connections handle live data. The browser also stores cookies, updates its HTTP cache, and may pre-render hints for likely next navigations. From the user's perspective, the page is "loaded" — but under the hood, it's still working.
