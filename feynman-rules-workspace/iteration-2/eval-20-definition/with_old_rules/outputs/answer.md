In HTTP context, an idempotent method produces the same server state regardless of how many times it is called with the same request. GET, PUT, HEAD, and DELETE are idempotent. POST is not — calling it twice typically creates two resources.

The practical implication: safe to auto-retry idempotent requests after a network timeout. Retrying a POST risks duplicate submissions (double charges, duplicate records).
