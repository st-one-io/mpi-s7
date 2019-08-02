/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

/*jshint esversion: 6, node: true*/
const {EventEmitter} = require('events');
const MPIParser = require('./mpiParser.js');
const MPISerializer = require('./mpiSerializer.js');
const MPIStream = require('./mpiStream.js');
const PPPSocket = require('../ppp-usb/pppSocket.js');
const C = require('./mpiConstants.json');

const util = require('util');
const debug = util.debuglog('mpi-s7');


class MPIAdapter extends EventEmitter{

    constructor(device, opts) {
        debug("new MPIAdapter");

        opts = opts || {};
        super();

        if(opts.transport == 'ppp' || opts.transport === undefined) {
            this._transportType = 'ppp';
            this._transport = new PPPSocket(device, opts.transportOpts);
        } else {
            //maybe future protocols?
            throw new Error(`Unknown transport [${opts.transport}]`);
        }

        if(opts.maxMPIAddress !== undefined && opts.maxMPIAddress !== null){
            let maxMPIAddress = parseInt(opts.maxMPIAddress);
            if(isNaN(maxMPIAddress) || maxMPIAddress < 1 || maxMPIAddress > 0x7f){
                throw new Error(`Invalid maxMPIAddress parameter [${opts.maxMPIAddress}]`);
            }
            this._maxMPIAddress = maxMPIAddress;
        } else {
            this._maxMPIAddress = 0x1f;
        }

        if (opts.selfMPIAddress !== undefined && opts.selfMPIAddress !== null) {
            let selfMPIAddress = parseInt(opts.selfMPIAddress);
            if (isNaN(selfMPIAddress) || selfMPIAddress < 0 || selfMPIAddress > this._maxMPIAddress) {
                throw new Error(`Invalid selfMPIAddress parameter [${opts.selfMPIAddress}]`);
            }
            this._selfMPIAddress = selfMPIAddress;
        } else {
            this._selfMPIAddress = 0;
        }

        this._skipIdent = !!opts.skipIdent;
        this._mpiParser = new MPIParser();
        this._mpiSerializer = new MPISerializer();
        this._streams = new Map();
        this._streamNextId = 1;
        this._opening = false;
        this._closing = false;
        this._connected = false;
        this._lastAckSeqId = null;

        this._mpiParser.on('error', e => {
            debug('MPIAdapter _mpiParser#onError', e);
            this.emit('error', e);
        });
        this._mpiSerializer.on('error', e => {
            debug('MPIAdapter _mpiSerializer#onError', e);
            this.emit('error', e);
        });
        this._transport.on('error', e => {
            debug('MPIAdapter _socket#onError', e);
            this.emit('error', e);
        });
        this._transport.on('ppp-message', (d, cb) => this._handleIncomingMessage(d, cb));
        this._transport.on('close', e => this._onTransportClose(e));
    }

    _onTransportClose(e) {
        debug("MPIAdapter _onTransportClose", e);
        this._connected = false;

        this.emit('close', e);
    }
    
    async _handleIncomingMessage(d, cb) {
        debug("MPIAdapter _handleIncomingMessage", d);

        let response;
        let data = await this._mpiParser.parseAsync(d);
        debug("MPIAdapter _handleIncomingMessage data-parsed", data);

        //get the responsible stream by remoteId
        let stream = this._streams.get(data.remoteId);
        let status = true;

        switch (data.command) {
            case C.bus.command.DATA_EXCHANGE:

                if (!stream) {
                    debug("MPIAdapter _handleIncomingMessage stream-not-found");
                    //TODO what to do if not found??
                    status = false;
                }
                
                response = await this._mpiSerializer.serializeAsync({
                    type: C.type.BUS,
                    command: C.bus.command.DATA_ACK,
                    mpiAddress: data.mpiAddress,
                    remoteId: data.localId,
                    localId: data.remoteId,
                    status: status,
                    sequence: data.sequence
                });
                cb(response);

                stream._handleIncomingData(data);
                break;
  
            case C.bus.command.DISCONNECTION_REQUEST:
                response = await this._mpiSerializer.serializeAsync({
                    type: C.type.BUS,
                    command: C.bus.command.DISCONNECTION_CONFIRM,
                    mpiAddress: data.mpiAddress,
                    remoteId: data.localId,
                    localId: data.remoteId,
                });
                cb(response);

                if(stream) {
                    stream._handleIncomingDisconnectRequest(true);
                }
                break;

            //case C.bus.command.CONNECTION_RESPONSE:
            //case C.bus.command.CONNECTION_CONFIRM:
            //case C.bus.command.DATA_ACK:
            //case C.bus.command.DISCONNECTION_CONFIRM:
            default:
                debug("MPIAdapter _handleIncomingMessage unexpected-command");
                //TODO unexpected
        }
    }

    _raiseMessageFromStream(data, stream) {
        debug("MPIAdapter _raiseErrorFromStream", stream._localId, data);

        /**
         * FIXME
         * This will trigger a normal disconnection request that expects a
         * response, but we shouldn't expect one, as we're actually answering a
         * request that we're interpreting as a response from another command.
         * A rewrite of the PPP api is needed, so that the request-response 
         * is handled by the MPI logic, not the PPP one
         */
        //if (data.command === C.bus.command.DISCONNECTION_REQUEST) {
        //    stream._handleIncomingDisconnectRequest();
        //} else {
            this.emit('error', new Error(`Unknown message command [${data.command}] from stream [${stream._localId}]`));
        //}
    }

    _closeStreams() {
        debug("MPIAdapter _closeStreams");

        for (const stream of this._streams.values()) {
            // this should close the stream, send the disconnect request
            //  and remove itself from this _streams map
            stream._handleIncomingDisconnectRequest();
        }
    }

    // -----

    get ident() {
        return this._ident;
    }

    get version() {
        return this._version;
    }

    async requestIdent() {
        debug("MPIAdapter requestIdent");
        let payload = await this._mpiSerializer.serializeAsync({
            type: C.type.ADAPTER,
            command: C.adapter.command.IDENTIFY
        });
        let response = await this._mpiParser.parseAsync(await this._transport.sendPPPMessage(payload));
        this._ident = response.payload;
        debug("MPIAdapter requestIdent ident", this._ident);
        return this._ident;
    }

    async scanBus() {
        debug("MPIAdapter scanBus");
        let payload = await this._mpiSerializer.serializeAsync({
            type: C.type.ADAPTER,
            command: C.adapter.command.BUS_SCAN
        });
        let response = await this._mpiParser.parseAsync(await this._transport.sendPPPMessage(payload));
        debug("MPIAdapter scanBus response", response);
        return response.payload;
    }

    async createStream(mpiAddr, opts) {
        debug("MPIAdapter createStream", mpiAddr, opts);

        if (!this._connected) {
            debug("MPIAdapter createStream not-connected");
            throw new Error('Not connected');
        }

        mpiAddr = parseInt(mpiAddr);
        if (isNaN(mpiAddr) || mpiAddr < 0 || mpiAddr > this._maxMPIAddress || mpiAddr == this._selfMPIAddress) {
            debug("MPIAdapter createStream invalid-MPI-addr", mpiAddr);
            throw new Error(`Invalid MPI address [${mpiAddr}]`);
        }

        let localId = this._streamNextId++;
        if (this._streamNextId > 0x7f) {
            debug("MPIAdapter createStream reset-_streamNextId");
            // 0x7f is a guess on the maximum number, may need to change
            this._streamNextId = 0;
        }

        // STEP 1: send CONNECTION_REQUEST, expect CONNECTION_RESPONSE
        let connectionRequest = {
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_REQUEST,
            mpiAddress: mpiAddr,
            localId: localId,
            remoteId: 0
        };
        debug("MPIAdapter createStream connectionRequest", connectionRequest);
        let payloadReq = await this._mpiSerializer.serializeAsync(connectionRequest);
        let response = await this._mpiParser.parseAsync(await this._transport.sendPPPMessage(payloadReq));
        debug("MPIAdapter createStream connectionResponse", response);
        if (response.command != C.bus.command.CONNECTION_RESPONSE) {
            debug("MPIAdapter createStream connectionResponse refused");
            throw new Error(`Connection step 1 refused with command [${response.command}] != [${C.bus.command.CONNECTION_RESPONSE}] CONNECTION_RESPONSE`, response);
        }

        let remoteId = response.localId; //localId of response is the remoteID of our requests

        // STEP 2: send CONNECTION_CONFIRM, expect CONNECTION_CONFIRM
        let connectionConfirm = {
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_CONFIRM,
            mpiAddress: mpiAddr,
            localId: localId,
            remoteId: remoteId
        };
        debug("MPIAdapter createStream connectionConfirm", connectionConfirm);
        let payloadConf = await this._mpiSerializer.serializeAsync(connectionConfirm);
        let confirm = await this._mpiParser.parseAsync(await this._transport.sendPPPMessage(payloadConf));
        debug("MPIAdapter createStream connectionConfirmAck", confirm);
        if (confirm.command != C.bus.command.CONNECTION_CONFIRM) {
            throw new Error(`Connection step 2 refused with command [${confirm.command}] != [${C.bus.command.CONNECTION_CONFIRM}] CONNECTION_CONFIRM`, confirm);
        }

        let stream = new MPIStream(this,{
            mpiAddr, localId, remoteId
        });

        this._streams.set(localId, stream);

        return stream;
    }

    get isConnected() {
        return this._connected
    }

    async open() {
        debug("MPIAdapter open");

        if (this._connected || this._opening || this._closing) {
            throw new Error('Open already called');
        }

        //TODO 
        /* looks like, if there's an error the adapter will answer the
         * open command (01 03 02) with an error code (E=0313)
         * we should probably check for that
         */
        this._opening = true;
        await this._transport.open();
        if(!this._skipIdent){
            await this.requestIdent();
        }

        //perform adapter connect
        let payload = await this._mpiSerializer.serializeAsync({
            type: C.type.ADAPTER,
            command: C.adapter.command.CONNECT,
            mpiLocalAddress: this._selfMPIAddress
            //TODO we'll need to set a lot of bus options
        });
        let response = await this._mpiParser.parseAsync(await this._transport.sendPPPMessage(payload));
        this._version = response.payload;
        debug("MPIAdapter open version", this._version);
        this._connected = true;
        this._opening = false;

        process.nextTick(() => this.emit('connect'));
    }

    async close() {
        debug("MPIAdapter close");

        if (!this._connected) {
            debug("MPIAdapter close not-connected");
            return;
        }

        // close any open stream before closing the adapter
        this._closeStreams();

        this._connected = false;
        let payload = await this._mpiSerializer.serializeAsync({
            type: C.type.ADAPTER,
            command: C.adapter.command.DISCONNECT
        });
        await Promise.race([this._transport.sendPPPMessage(payload), new Promise(res => setTimeout(res, 3000))]);
        await this._transport.close();
    }
}
debug("create MPIAdapter");
module.exports = MPIAdapter;