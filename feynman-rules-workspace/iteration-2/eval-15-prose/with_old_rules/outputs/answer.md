TCP uses a 3-way handshake because establishing a reliable connection requires both parties to confirm they can both send and receive before data flows.

The first step is the SYN: the client sends a synchronize packet with its initial sequence number, signaling it wants to connect. The server responds with SYN-ACK — it acknowledges the client's sequence number and advertises its own. Finally the client sends ACK to confirm the server's sequence number. After this exchange, both sides have verified two things: that the other side is reachable and that both can send and receive packets successfully.

This three-step process is the minimum needed for bidirectional confirmation. A two-way exchange would work for one direction but leave the server uncertain whether its own SYN reached the client. The handshake also lets both sides agree on initial sequence numbers, which TCP uses to order packets and detect losses on an inherently unreliable IP layer.
