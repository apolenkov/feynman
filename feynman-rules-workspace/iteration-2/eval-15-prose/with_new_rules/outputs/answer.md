TCP uses a 3-way handshake because establishing a reliable connection requires both parties to confirm they can both send and receive before data flows.

The initiator sends SYN with its starting sequence number. The responder replies with SYN-ACK — acknowledging the initiator's sequence number and advertising its own. The initiator then sends ACK to confirm the responder's number. At this point both sides have exchanged and acknowledged sequence numbers.

Three steps is the minimum for bidirectional confirmation. Two steps would leave the responder uncertain its SYN was received. Four steps would be redundant. The handshake also establishes the sequence numbers TCP uses to order packets and detect loss over an inherently unreliable IP layer.
