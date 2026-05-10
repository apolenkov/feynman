When you type a URL and press enter:

```
[DNS lookup] --> [TCP connect] --> [TLS handshake] --> [HTTP GET] --> [response] --> [render]
```

**Step-by-step:**

1. **DNS lookup** — browser checks cache, then OS cache, then recursive resolver → gets IP
2. **TCP connect** — 3-way handshake (SYN → SYN-ACK → ACK) to the server IP:443
3. **TLS handshake** — client hello, server cert, key exchange, session keys negotiated
4. **HTTP GET** — browser sends `GET /path HTTP/1.1` with headers (Host, Accept, etc.)
5. **Server response** — server returns status + headers + body (HTML, JSON, binary)
6. **Render** — browser parses HTML, fetches sub-resources (CSS, JS, images), paints viewport

Each step is sequential: DNS must resolve before TCP can connect; TCP must establish before TLS begins.
