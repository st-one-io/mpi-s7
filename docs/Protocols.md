# Protocols

This is a compilation of the empirical knowledge aquired when developing this library. Some of it has been infered by raw byte stream analysis, and some by analyzing the implementation of other libraries, like Libnodave.
Nothing here should be considered correct or reference for any other implementation or usage.

----------

## PPP

The base-level protocol that runs atop of the USB bus itself. It's the first layer. Apparently, it's used for framing with acknowledge, checksumming and a very basic session control.

### Telegram format

    0x7e + <seqId(1)> + [ <size(1)> + <sizeCompl(1)> + <payload(n)> ] + <chksum(2)> + 0x7e

Every frame starts and ends with `0x7e`, has a byte for sequence and function control (called here `seqId`), and optional payload, and a 2-byte checksum

### Field `seqId`

      7   6   5   4   3   2   1   0
    +-------------------------------+
    | c |   seq A   | y |   seq B   |
    +-------------------------------+

This seems to be the rough structure of the field, and depending of the case they have different meanings.

The 7th bit `c` is the "control" bit. When set, it indicates this message does **not** have a payload, and its function or meaning is represented on the other bits

 - `10001xxx` (`0x88` to `0x8f`): indicates an acknowledge of a message, where `xxx` is the sequence of the original message + 1
 - `10011010` (`0x98`): has been observed by us as a REFUSED
 - `11001010` (`0xca`): seems to be a "session close", is understood by libnodave as a REFUSED
 - `11001110` (`0xce`): understood as an "ok"
 - `11111100` (`0xfc`): seems to be "session open", "ping", or something like this
 - `11111000` (`0xf8`): is understood by libnodave as a REFUSED, writes `0xca`, reads answer and discards, and tries again

If the control bit is not set, then this should be a data message, and a payload should be present. In this case, `seqA` and `seqB` are indication of the sequence number of the message

### Payload

The payload, when present, is preceeded by two bytes indicating the payload's length. Given a payload of length `n` bytes, the first byte is equal to `n` and the second byte is the complement of it, that is, `0xff - n`. Therefore, the maximum payload length in a message is 255 bytes.


----------

## MPI

This seems to be the "main" protocol when we're talking about MPI/PPI/DP adapters. Among its known features, it enables one to scan the bus for devices, set bus parameters, and open data streams to devices on the bus. 

First byte: type of telegram
 - `0x01`: Adapter control
 - `0x04`: Command to the bus


### Adapter control (0x01) telegrams

The next (second) byte indicates a command:
 - `0x03`: Connect to the adapter
 - `0x04`: Disconnect from adapter
 - `0x07`: Scan bus for partners
 - `0x08`: ???
 - `0x0c`: ???
 - `0x0d`: Identify adapter
 - `0x0e`: Current configuration request

The third byte indicates the direction:
 - `0x02`: Request (what we send)
 - `0x20`: Response (what we receive)

A payload may then follow, depending on the telegram command and direction


### Bus command (0x04) telegrams

The next (second) byte indicates the address on the bus, with the highest (7th) bit set. That is, if we want to address the device on the address 6, we'd set this bye to `0x86`

The meaning of the third byte is not much understood, but has been observed to be `0x02`, `0x80`, and `0x00`, depending on the connection state and direction of the message

The fourth byte is what we've named "telegram subtype", and has been observed to be:
 - `0x0c`: Unconnected data - only used on the first message to setup the communication
 - `0x0d`: Connected data -  all other telegrams

The fifth byte is the destination (receiver) id, and is negotiated during the communication setup.

The sixth byte is the source (sender) id, and seems to be arbtrarily defined by us. Used in conjunction with the destination id, this can be used to uniquely idetify a connection/stream, much like a TCP socket does.

The seventh byte is the command, and it can be:
 - `0xe0`: Connection request
 - `0xd0`: Connection response
 - `0x05`: Connection confirm
 - `0xf1`: Data exchange
 - `0xb0`: Data acknowedge
 - `0x80`: Disconnect request
 - `0xc0`: Disconnect confirm

Other bytes may then follow, depending on the command above.