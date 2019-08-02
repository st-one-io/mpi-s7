/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

/*jshint esversion: 6, node: true*/
const {
    Duplex
} = require('stream');
const C = require('./mpiConstants.json');

const util = require('util');
const debug = util.debuglog('mpi-s7');

class MPIStream extends Duplex {

    constructor(parent, opts, streamOpts) {

        super(streamOpts);

        this._parent = parent;
        this._mpiAddr = opts.mpiAddr;
        this._localId = opts.localId;
        this._remoteId = opts.remoteId;

        debug("new MPIStream", this._localId, opts, streamOpts);

        this._sequence = 0;
    }

    get _nextSequence() {
        let seq = this._sequence++;
        if (this._sequence > 0xff) {
            this._sequence = 1; //wraps 0xff --> 0x01
        }
        return seq;
    }

    _read(size) {
        debug("MPIStream _read", this._localId, size);
        //nothing to do here
    }

    _handleIncomingData(data) {
        debug("MPIStream _handleIncomingData", this._localId, data);

        this.push(data.payload);
    }

    _handleIncomingDisconnectRequest(err) {
        debug("MPIStream _handleIncomingDisconnectRequest", this._localId);

        this.push(null); //signalizes end of read stream, emits 'end' event
        this.emit('close'); //signalizes end of write stream
    }

    _write(chunk, encoding, cb) {
        debug("MPIStream _write", this._localId, encoding, chunk);

        let msgSequence = this._nextSequence;
        let cmd = {
            type: C.type.BUS,
            command: C.bus.command.DATA_EXCHANGE,
            mpiAddress: this._mpiAddr,
            localId: this._localId,
            remoteId: this._remoteId,
            sequence: msgSequence,
            payload: chunk
        };
        this._parent._mpiSerializer.serializeAsync(cmd)
            .then((data) => {
                debug("MPIStream _write serializeAsync-data", this._localId, data);
                return this._parent._transport.sendPPPMessage(data);
            }).then((res) => {
                debug("MPIStream _write sendPPPMessage-response", this._localId, res);
                return this._parent._mpiParser.parseAsync(res);
            }).then(data => {
                debug("MPIStream _write parseAsync-data", this._localId, data);

                if (data.command === C.bus.command.DISCONNECTION_REQUEST) {
                    this._handleIncomingDisconnectRequest();
                    cb();
                    return;
                }

                if (data.command != C.bus.command.DATA_ACK) {
                    cb(new Error(`Internal transport error: Unexpected command [${data.command}]`));
                    this._parent._raiseMessageFromStream(data);
                    return;
                }

                if (data.sequence !== msgSequence) {
                    cb(new Error(`Internal transport error: Unexpected sequence [${data.sequence}]`));
                    return;
                }

                if (!data.status) {
                    cb(new Error('Internal transport error: Got a negative acknowledge'));
                    return;
                }

                cb();
            }).catch(e => {
                debug("MPIStream _write answer-catch", this._localId, e);
                cb(e);
            });
    }

    _final(cb) {
        debug("MPIStream _final", this._localId);

        let cmd = {
            type: C.type.BUS,
            command: C.bus.command.DISCONNECTION_REQUEST,
            mpiAddress: this._mpiAddr,
            localId: this._localId,
            remoteId: this._remoteId
        };

        this._parent._mpiSerializer.serializeAsync(cmd)
            .then((data) => {
                debug("MPIStream _final serializeAsync-data", this._localId, data);
                return this._parent._transport.sendPPPMessage(data);
            }).then((res) => {
                debug("MPIStream _final message-response", this._localId, res);
                return this._parent._mpiParser.parseAsync(res);
            }).then(data => {
                debug("MPIStream _final parseAsync-data", this._localId, data);
                
                if (data.command !== C.bus.command.DISCONNECTION_CONFIRM) {
                    cb(new Error(`Internal transport disconnection error: Unexpected command [${data.command}]`));
                    return;
                }

                this.emit('close');
                cb();
            }).catch(e => {
                debug("MPIStream _final answer-catch", this._localId, e);
                cb(e);
            });
    }
}
module.exports = MPIStream;