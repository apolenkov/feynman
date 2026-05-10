TCP uses a 3-way handshake to establish a reliable connection before any data flows. The handshake solves a fundamental problem: both sides need to agree that the connection is ready and that each side can send and receive.

The initiator sends a SYN (synchronize) packet, signaling it wants to connect and advertising its initial sequence number. The responder replies with SYN-ACK — acknowledging the initiator's sequence number and advertising its own. Finally the initiator sends ACK, confirming the responder's sequence number. At this point both sides have exchanged and acknowledged sequence numbers, so they can track packet ordering and detect loss.

This three-step exchange is the minimum required to achieve bidirectional acknowledgment. A two-way exchange would leave the responder unsure whether its own SYN was received. Four steps would be redundant. The 3-way handshake is the smallest reliable mutual confirmation protocol that works over an unreliable network layer.
