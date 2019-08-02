/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

//@ts-check
/*jshint esversion: 6, node: true*/

const usb = require('usb');
const PPPParser = require('./pppParser.js');
const PPPSerializer = require('./pppSerializer.js');
const { Duplex } = require('stream');

const util = require('util');
const debug = util.debuglog('mpi-s7');

const USB_IFACE_DATA = 0;
const USB_ENDPOINT_IN = 0x82;
const USB_ENDPOINT_OUT = 0x02;

const TIMEOUT_CLOSE = 2000;

class PPPSocket extends Duplex {

    constructor(device, opts) {
        debug("new PPPSocket");

        opts = opts || {};

        if(!device){
            throw new Error("Parameter 'device' is mandatory");
        }

        super();

        this._usb = {
            device: device,
            iface: null,
            endpointIn: null,
            endpointOut: null,
            hadKernelDriver: false,
            outCount: 0,
            closePending: false
        };
        this._pppParser = new PPPParser();
        this._pppSerializer = new PPPSerializer();
        this._queue = [];
        this._sequence = 0;
        this._msgOut = null;
        this._msgIn = null;
        this._opening = null;
        this._closing = null;
        this._connected = false;
        this._maxRetry = opts.maxRetry || 3;
        this._lastAckSeqId = null;

        this._pppParser.on('error', e => {
            debug('PPPSocket _pppParser#onError', e);
            this.emit('error', e);
        });
        this._pppSerializer.on('error', e => {
            debug('PPPSocket _pppSerializer#onError', e);
            this.emit('error', e);
        });

        this._pppParser.on('data', d => this._handleData(d));
    }

    _getNextSequence() {
        let seq = this._sequence;
        this._sequence++;
        this._sequence %= 8;
        debug("PPPSocket _getNextSequence", seq, this._sequence);
        return seq;
    }

    _onOpen() {
        debug('PPPSocket _onOpen');

        this._pppSerializer.write({
            seqId: 0xfc,
        });
    }

    _close() {
        debug('PPPSocket _close');

        this._pppSerializer.write({
            seqId: 0xca,
        });
    }

    _handleData(data) {
        debug("PPPSocket _handleData", data);
        
        if(data.isControl){
            
            if (this._closing) {
                debug("PPPSocket _handleData _closing");
                this._connected = false;
                if (data.seqId == 0xce) { //OK
                    if (this._opening) {
                        this._closing = null;
                        this._onOpen();
                    } else {
                        this._closeUsb();
                    }
                } else {
                    if(this._opening){
                        this._opening.rej(new Error(`Error trying to disconnect before connecting with code [${data.seqId}]`));
                        this._opening = null;
                    } else {
                        this._closing.rej(new Error(`Disconnection failed with error code [${data.seqId}]`));
                    }
                }

            } else if (this._opening) {
                debug("PPPSocket _handleData _opening");
                if(data.seqId == 0xce){ //OK
                    this._connected = true;
                    this._opening.res();
                    this._opening = null;
                    this.emit('connect');

                } else if (data.seqId == 0xca) { //try again
                    if (this._opening.retries > this._maxRetry) {
                        this._opening.rej(new Error('Exceeded max retry times when connecting'));
                        this._opening = null;
                        this._closeUsb();
                        return;
                    }
                    this._opening.retries += 1;
                    this._onOpen();

                } else if (data.seqId == 0xf8) { //closes, and try again
                    if(this._opening.retries > this._maxRetry){
                        this._opening.rej(new Error('Exceeded max retry times when connecting'));
                        this._opening = null;
                        this._closeUsb();
                        return;
                    }
                    this._opening.retries += 1;

                    this._closing = {
                        res: () => {},
                        rej: () => {},
                        timer: null
                    };
                    this._close();

                } else { //dont' know, reject it
                    this._opening.rej(new Error(`Connection rejected with code [${data.seqId}]`));
                    this._opening = null;
                    this._closeUsb();
                }
            } else {
                if(data.seqA == 0){ //is an ack
                    if(this._lastAckSeqId == data.seqId){
                        //we received the same again, so it's a keepalive that we have to reply to
                        debug("PPPSocket _handleData keepAlive-ack", data.seqId);
                        this._pppSerializer.write({
                            seqId: data.seqId
                        });
                    }
                    this._lastAckSeqId = data.seqId;
                    //TODO - should we save this on the sent acks too?
                } else {
                    //TODO - looks like if seqA = 001 of a control packet, we have a wrong sequence
                    this.emit('control', data);
                }
            }

        } else {
            
            //we need to send an ack to every non-control packet
            let ackSeqId = 0x88 | (data.seqA == data.seqB ? data.seqB + 1 : data.seqB);
            debug("PPPSocket _handleData ackSeqId", ackSeqId);
            this._pppSerializer.write({
                seqId: ackSeqId
            });

            if(this._msgOut !== null && ((this._msgOut.sequence + 1) & 0x07) === data.seqB) {
                debug("PPPSocket _handleData response", this._msgOut.sequence, data.seqB);
                //indicates it's an acknowledge
                this._msgOut.resolve(data.payload);
                this._msgOut = null;
                this._processQueue();
                return;
            } else {
                debug("PPPSocket _handleData no-response", this._msgOut, data.seqB);
            }

            //TODO what happens if there's already a message in _msgIn?

            if(this._msgOut) {
                //crazy fix
                this._getNextSequence(); //increment internal sequence, as this seems to be a request
            }
            this._msgIn = data;
            this.emit('ppp-message', data.payload, d => this._sendMessageAck(d));
        }
    }

    _sendMessageAck(data) {
        debug("PPPSocket _sendMessageAck", data);

        //TODO can be that we don't have _msgIn anymore?

        let seq = (this._getNextSequence() << 4) | ((this._msgIn.seqB + 1) & 0x07);
        this._pppSerializer.write({
            seqId: seq,
            payload: data
        });
        this._msgIn = null;
        this._processQueue();
    }

    _processQueue() {
        debug("PPPSocket _processQueue");

        if (!this._connected || this._msgIn !== null || this._msgOut !== null) {
            debug("PPPSocket _processQueue in-work");
            //we're have a request in transit, can't process right now
            return;
        }

        if(this._queue.length == 0){
            debug("PPPSocket _processQueue empty");
            return;
        }

        let seq = this._getNextSequence();
        this._msgOut = this._queue.splice(0, 1)[0];
        this._msgOut.sequence = seq;
        
        debug("PPPSocket _processQueue process", this._msgOut);
        this._pppSerializer.write({
            seqId: ((seq << 4) | seq),
            payload: this._msgOut.payload
        });
    }

    _onUsbError(e, endpoint) {
        debug("PPPSocket _onUsbError", endpoint, e);

        this.emit('error', e);
    } 
    
    _onUsbEnd(endpoint) {
        debug("PPPSocket _onUsbEnd", endpoint);
    }
    
    _writeUsb(d) {
        debug("PPPSocket _writeUsb", d);

        this._usb.outCount++;
        this._usb.endpointOut.transfer(d, (e) => {
            this._usb.outCount--;
            if (this._usb.closePending) return this._closeUsb2();

            if (!e) return;

            if(this._msgOut) {
                //we may have failed to write this msgOut, so reject it
                this._msgOut.reject(e);
                this._msgOut = null;
                process.nextTick(() => this._processQueue());
            }

            debug("PPPSocket write-usb error", e);
            this.emit('error', e);
            this._closeUsb();
        });
    }

    _closeTimeout() {
        debug("PPPSocket _closeTimeout");
        this._closeUsb();
    }

    _closeUsb() {
        debug("PPPSocket _closeUsb");

        if (this._closing) {
            clearTimeout(this._closing.timer);
        }

        try {
            let usb = this._usb;

            usb.endpointIn.stopPoll(() => {
                if (usb.outCount > 0) {
                    debug("PPPSocket _closeUsb defer", usb.outCount);
                    usb.closePending = true;
                } else {
                    this._closeUsb2();
                }
            });
        } catch (e) {
            if (this._closing) {
                this._closing.rej(e);
                this._closing = null;
            } else {
                this.emit('error', e);
            }
        }
    }

    _closeUsb2() {
        debug("PPPSocket _closeUsb2");
        
        let usb = this._usb;
        debug("PPPSocket _closeUsb2 outCount", usb.outCount);

        try {
            usb.iface.release(true, (e) => {
                if (e) throw e;

                if (usb.hadKernelDriver && !usb.iface.isKernelDriverActive()) {
                    usb.iface.attachKernelDriver();
                }

                usb.device.close();
                if (this._closing) {
                    this._closing.res();
                }
                this._closing = null;
                this.emit('close');
            });
        } catch (e) {
            if (this._closing) {
                this._closing.rej(e);
                this._closing = null;
            } else {
                this.emit('error', e);
            }
        }
    }
    
    // -----

    async open() {
        debug("PPPSocket open");
        return new Promise((res, rej) => {
            if(this._connected || this._opening || this._closing){
                rej(new Error('Open already called'));
                return;
            }

            this._opening = {res, rej, retries: 0};
            
            let usb = this._usb;

            usb.device.open(); //may throw
            usb.iface = usb.device.interface(USB_IFACE_DATA);

            if (process.platform === 'linux' && usb.iface.isKernelDriverActive()){
                usb.hadKernelDriver = true;
                usb.iface.detachKernelDriver();
            }

            usb.endpointIn = usb.iface.endpoint(USB_ENDPOINT_IN);
            usb.endpointOut = usb.iface.endpoint(USB_ENDPOINT_OUT);

            usb.iface.claim();

            usb.endpointIn.on('error', e => this._onUsbError(e, 'in'));
            usb.endpointOut.on('error', e => this._onUsbError(e, 'out'));
            usb.endpointIn.on('end', () => this._onUsbEnd('in'));
            usb.endpointOut.on('end', () => this._onUsbEnd('out'));
            usb.endpointOut.timeout = 500; //defaut of 500ms for out transsfers
            
            usb.endpointIn.on('data', d => {
                debug("PPPSocket #onEndpointData", d);
                this._pppParser.write(d);
            });
            this._pppSerializer.on('data', d => this._writeUsb(d));

            usb.endpointIn.startPoll();

            this._onOpen();
        });
    }

    async close() {
        debug("PPPSocket close");
        return new Promise((res, rej) => {
            if(this._closing) {
                rej(new Error('Close already called'));
                return;
            }

            this._connected = false;
            let timer = setTimeout(() => this._closeTimeout(), TIMEOUT_CLOSE);
            this._closing = {res, rej, timer};
            this._close();
        });
    }

    async sendPPPMessage(payload) {
        debug("PPPSocket sendMessage", payload);
        return new Promise((resolve, reject) => {
            if(this._closing){
                reject(new Error('Connection already closed'));
                return;
            }

            this._queue.push({
                payload, resolve, reject
            });
            this._processQueue();
        });
    }
}
debug("create PPPSocket");
module.exports = PPPSocket;