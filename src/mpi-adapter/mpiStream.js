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

        // automatically closes writable part when readable part closes
        streamOpts = streamOpts || {};
        streamOpts.allowHalfOpen = false;

        super(streamOpts);

        this._parent = parent;
        this._mpiAddr = opts.mpiAddr;
        this._localId = opts.localId;
        this._remoteId = opts.remoteId;
        this._disconnected = false;

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

    /**
     * Handles a disconnection request
     * The @param disconnected parameter signalizes that disconnect request and
     * response has already been handled, so we don't need to do this again.
     * @param {boolean} [disconnected] whether the stream is already disconnected
     */
    _handleIncomingDisconnectRequest(disconnected) {
        debug("MPIStream _handleIncomingDisconnectRequest", this._localId);

        if(disconnected){
            this._disconnected = true;
        }

        this.push(null); //signalizes end of read stream, emits 'end' event
        process.nextTick(() => this.emit('close')); //signalizes end of write stream
    }

    async _disconnectRequest() {
        debug("MPIStream _disconnectRequest", this._localId);

        if (this._disconnected) {
            debug("MPIStream _disconnectRequest already-disconnected", this._localId);
            return;
        }
        this._disconnected = true;

        let cmd = {
            type: C.type.BUS,
            command: C.bus.command.DISCONNECTION_REQUEST,
            mpiAddress: this._mpiAddr,
            localId: this._localId,
            remoteId: this._remoteId
        };

        let cmdData = await this._parent._mpiSerializer.serializeAsync(cmd);
        debug("MPIStream _disconnectRequest cmdData", this._localId, cmdData);
        let responseData = await this._parent._transport.sendPPPMessage(cmdData);
        debug("MPIStream _disconnectRequest responseData", this._localId, responseData);
        let response = await this._parent._mpiParser.parseAsync(responseData);
        debug("MPIStream _disconnectRequest response", this._localId, response);

        if (response.command !== C.bus.command.DISCONNECTION_CONFIRM) {
            debug("MPIStream _disconnectRequest err-response-command", this._localId, response.command);
            throw new Error(`Internal transport disconnection error: Unexpected command [${response.command}]`);
        }
    }

    async _dataExchange(chunk) {
        debug("MPIStream _dataExchange", this._localId, chunk);

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

        let cmdData = await this._parent._mpiSerializer.serializeAsync(cmd);
        debug("MPIStream _dataExchange cmdData", this._localId, cmdData);

        let responseData = await this._parent._transport.sendPPPMessage(cmdData);
        debug("MPIStream _dataExchange responseData", this._localId, responseData);

        let response = await this._parent._mpiParser.parseAsync(responseData);
        debug("MPIStream _dataExchange response", this._localId, response);

        // response checks
        if (response.command != C.bus.command.DATA_ACK) {
            debug("MPIStream _dataExchange err-response-command", this._localId, response.command);
            this._parent._raiseMessageFromStream(response, this);
            throw new Error(`Internal transport error: Unexpected command [${response.command}]`);
        } else if (response.sequence !== msgSequence) {
            debug("MPIStream _dataExchange err-response-sequence", this._localId, response.sequence, msgSequence);
            throw new Error(`Internal transport error: Unexpected sequence [${response.sequence}]`);
        } else if (!response.status) {
            debug("MPIStream _dataExchange err-response-status", this._localId, response.status);
            throw new Error('Internal transport error: Got a negative acknowledge');
        }
    }

    _releaseStream() {
        debug("MPIStream _releaseStream", this._localId);
        this._parent._streams.delete(this._localId);
    }

    _write(chunk, encoding, cb) {
        debug("MPIStream _write", this._localId, encoding, chunk);

        this._dataExchange(chunk).then(cb).catch(cb);
    }

    _final(cb) {
        debug("MPIStream _final", this._localId);

        this._disconnectRequest().then(() => {
            this._releaseStream();
            this._handleIncomingDisconnectRequest();
            cb();
        }).catch(e => {
            this._releaseStream();
            this._handleIncomingDisconnectRequest();
            cb(e);
        });
    }
}
module.exports = MPIStream;