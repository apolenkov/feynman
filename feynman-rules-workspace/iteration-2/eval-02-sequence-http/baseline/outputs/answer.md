When you type a URL and hit enter, your browser goes through these stages:

DNS resolution → TCP connection → TLS handshake → HTTP request → response rendering

First, the browser checks its DNS cache or asks a resolver to translate the domain name to an IP address. Then it opens a TCP connection to that IP on port 80 (HTTP) or 443 (HTTPS). For HTTPS, a TLS handshake negotiates encryption keys. The browser sends an HTTP GET request, the server processes it and returns a response (HTML, JSON, etc.), and finally the browser parses and renders the content.
