`[DNS lookup] → [TCP connect] → [TLS handshake] → [HTTP GET] → [response] → [render]`

The browser resolves the domain to an IP via DNS (cache → OS → recursive resolver). It opens a TCP connection (3-way handshake) then negotiates TLS session keys. The HTTP GET request fires; the server returns status + headers + body. Finally the browser parses HTML, fetches sub-resources, and paints the viewport. Each stage is a strict prerequisite for the next.
