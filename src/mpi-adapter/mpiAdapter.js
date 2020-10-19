//@ts-check
/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const { EventEmitter } = require('events');
const MPIParser = require('./mpiParser.js');
const MPISerializer = require('./mpiSerializer.js');
const MPIStream = require('./mpiStream.js');
const PPPSocket = require('../ppp-usb/pppSocket.js');
const C = require('./mpiConstants.json');

const util = require('util');
const debug = util.debuglog('mpi-s7');

/** @typedef {import('usb').Device} Device */
/** @typedef {import('./mpiSerializer').ConnectionParams} ConnectionParams */

/**
 * @readonly
 * @enum {string}
 */
const PlcType = ['s7-300/400', 's7-200'];


/**
 * @readonly
 * @enum {number}
 */
const BusSpeed = {
    BAUD_AUTO: 0,
    BAUD_9k6: 0,
    BAUD_19k2: 1,
    BAUD_45k45: 5,
    BAUD_93k75: 6,
    BAUD_187k5: 2,
    BAUD_500k: 3,
    BAUD_1M5: 4
};

/**
 * @class
 */
class MPIAdapter extends EventEmitter {

    static BusSpeed = BusSpeed;

    /**
     * 
     * @param {Device} device 
     * @param {object} [opts] 
     * @param {string} [opts.transport='ppp']
     * @param {object} [opts.transportOpts]
     */
    constructor(device, opts) {
        debug("new MPIAdapter");

        opts = opts || {};
        super();

        if (opts.transport == 'ppp' || opts.transport === undefined) {
            this._transportType = 'ppp';
        } else {
            //maybe future protocols?
            throw new Error(`Unknown transport [${opts.transport}]`);
        }

        this._transport = null;
        this._device = device;
        this._transportOpts = opts.transportOpts || {};
        this._transportOpts.msgTimeout = 3000;


        this._mpiParser = new MPIParser();
        this._mpiSerializer = new MPISerializer();
        /** @type {Map<number,MPIStream>} */
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

                if (stream) {
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

    async _closeStreams() {
        debug("MPIAdapter _closeStreams");

        let promises = [];
        for (const stream of this._streams.values()) {
            // this should close the stream, send the disconnect request
            //  and remove itself from this _streams map
            promises.push(stream.closeStream());
        }

        await Promise.all(promises);
    }

    /**
     * Gets called internally when the adapter is detached from the system
     */
    _detach() {
        debug("MPIAdapter _detach");

        //TODO some cleanup of the internal state is probably needed

        this.emit('detach');
    }

    // -----

    get version() {
        return this._version;
    }

    async requestVersion() {
        debug("MPIAdapter requestVersion");

        if (!this._transport) throw new Error('No transport available to fulfill the request');

        let payload = await this._mpiSerializer.serializeAsync({
            type: C.type.ADAPTER,
            command: C.adapter.command.IDENTIFY
        });
        let response = await this._mpiParser.parseAsync(await this._transport.sendPPPMessage(payload));
        this._version = response.payload;
        debug("MPIAdapter requestVersion ident", this._version);
        return this._version;
    }

    async scanBus() {
        debug("MPIAdapter scanBus");

        if (!this._transport) throw new Error('No transport available to fulfill the request');

        let payload = await this._mpiSerializer.serializeAsync({
            type: C.type.ADAPTER,
            command: C.adapter.command.BUS_SCAN
        });
        let response = await this._mpiParser.parseAsync(await this._transport.sendPPPMessage(payload));
        debug("MPIAdapter scanBus response", response);
        return response.payload;
    }

    /**
     * 
     * @param {number} mpiAddr 
     * @param {object} opts 
     */
    async createStream(mpiAddr, opts) {
        debug("MPIAdapter createStream", mpiAddr, opts);

        if (!this._connected) {
            debug("MPIAdapter createStream not-connected");
            throw new Error('Not connected');
        }

        if (!this._transport) throw new Error('No transport available to fulfill the request');

        mpiAddr = Number(mpiAddr);
        if (!isValidRange(mpiAddr, 0, this._maxBusAddress) || mpiAddr == this._selfBusAddress) {
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
            throw new Error(`Connection step 1 refused with command [${response.command}] != [${C.bus.command.CONNECTION_RESPONSE}] CONNECTION_RESPONSE`);
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
            throw new Error(`Connection step 2 refused with command [${confirm.command}] != [${C.bus.command.CONNECTION_CONFIRM}] CONNECTION_CONFIRM`);
        }

        let stream = new MPIStream(this, {
            mpiAddr, localId, remoteId
        });

        this._streams.set(localId, stream);

        return stream;
    }

    get isConnected() {
        return this._connected
    }

    /**
     * @param {object} opts
     * @param {number} [opts.maxBusAddress=15]
     * @param {number} [opts.selfBusAddress=0]
     * @param {BusSpeed} [opts.busSpeed=BAUD_AUTO]
     * @param {PlcType} [opts.plcType='s7-300/400']
     * @param {ConnectionParams} [opts.connectionParams] allows to manually control all connection params. If set, overrides `plcType`, `busSpeed`, `maxBusAddress` and `selfBusAddress`
     */
    async open(opts) {
        debug("MPIAdapter open");

        if (this._connected) return;

        if (this._opening || this._closing) {
            throw new Error('Cannot open adapter with another request in progress');
        }

        /**
         * Adapter connection
         * Take over the manual connection params if set.
         * Otherwise, try an heuristics to automatically determine
         * the needed parameters.
         */

        /** @type {ConnectionParams} */
        let connParams;
        if (opts.connectionParams) {
            // object with the individual parameters
            connParams = {
                ...opts.connectionParams,
                type: C.type.ADAPTER,
                command: C.adapter.command.CONNECT
            };
        } else {

            // no parameters manually set, so let's try out
            connParams = {
                type: C.type.ADAPTER,
                command: C.adapter.command.CONNECT,
                localBusAddr: opts.selfBusAddress || 0,
                maxBusAddr: opts.maxBusAddress || 15,
                busSpeed: opts.busSpeed || 0
            };

            if (opts.plcType == 's7-200') {
                connParams.ttr = 0x0064;
                connParams.tslot = 0x012c;
                connParams.tid1 = 0x0025;
                connParams.tid2 = 0x003c;
                connParams.trdy = 0x0016;
                connParams.tqui = 0x00;
                connParams.gapFactor = 0x0a;
                connParams.retryLimit = 0x01;
                connParams.busType = 0x00;
                connParams.flags = 0xc9;
                connParams.profile = 0xff;
            } else {
                connParams.ttr = 0x0017;
                connParams.tslot = 0x019f;
                connParams.tid1 = 0x003c;
                connParams.tid2 = 0x0190;
                connParams.trdy = 0x0014;
                connParams.tqui = 0x00;
                connParams.gapFactor = 0x05;
                connParams.retryLimit = 0x02;
                connParams.busType = 0x01;
                connParams.flags = 0x89;
                connParams.profile = 0xff;
            }
        }

        this._maxBusAddress = connParams.maxBusAddr;
        this._selfBusAddress = connParams.localBusAddr;

        try {
            this._opening = true;

            //test grace time before opening
            await new Promise(res => setTimeout(res, 1000));

            this._transport = new PPPSocket(this._device, this._transportOpts);
            this._transport.on('error', e => {
                debug('MPIAdapter _socket#onError', e);
                this.emit('error', e);
            });
            this._transport.on('ppp-message', (d, cb) => this._handleIncomingMessage(d, cb));
            this._transport.on('close', e => this._onTransportClose(e));

            await this._transport.open();

            // get the adapter's version
            await this.requestVersion();
            debug('\x1b[35m >> VERSION:\x1b[0m', this._version);

            let responseCode = '';
            const sendConnect = async () => {
                //perform adapter connect
                let payload = await this._mpiSerializer.serializeAsync(connParams);
                let response = await this._mpiParser.parseAsync(await this._transport.sendPPPMessage(payload));
                responseCode = response.payload;
                debug('\x1b[35m >> RESPONSE:\x1b[0m', responseCode);
            }

            await sendConnect();

            // hack to retry with different params on s7-200
            if (responseCode == 'E=031A' && !opts.connectionParams && opts.plcType == 's7-200') {
                connParams.flags = 0xc0;
                await sendConnect();
            }

            if (responseCode !== this._version) {
                //we didn't get the version, so we probably got an error code
                // and should terminate the connection process

                // check response
                let errorMatch = responseCode.match(/E=(\w+)/);
                if (errorMatch) { // E=xxxx
                    let errorCode = errorMatch[1];
                    let errorDesc = C.errorCodes[errorCode] || `Unknown error code [${errorCode}]`;
                    throw new Error(`Adapter connection rejected with [${responseCode}]: ${errorDesc}`);
                } else {
                    throw new Error(`Unknown response on MPI connection [${responseCode}]`);
                }
            }

        } catch (e) {

            try {
                await this._transport.close();
            } catch (e) {
                //ignore closing errors, because we probably haven't even connected at all
            }

            this._opening = false;
            this._transport = null;
            throw e;
        }

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

        this._connected = false;
        this._closing = true;

        try {
            // close any open stream before closing the adapter
            await this._closeStreams();

            let payload = await this._mpiSerializer.serializeAsync({
                type: C.type.ADAPTER,
                command: C.adapter.command.DISCONNECT
            });
            await Promise.race([this._transport.sendPPPMessage(payload), new Promise(res => setTimeout(res, 3000))]);
            await this._transport.close();
            this._transport = null;
            this._closing = false;

        } catch (error) {
            this._closing = false;
            throw error;
        }
    }
}
debug("create MPIAdapter");
module.exports = MPIAdapter;

function isValidRange(num, min, max) {
    if (typeof num !== 'number' || isNaN(num)) return false;
    return (num >= min) && (num <= max);
}

/**
 * 
 * @param {Promise} promise 
 * @param {number} timeout 
 * @param {string} errorText 
 */
function withTimeout(promise, timeout, errorText) {
    let timerPromise = new Promise((res, rej) => {
        setTimeout(() => rej(new Error(errorText)), timeout).unref();
    });
    return Promise.race([promise, timerPromise]);
}