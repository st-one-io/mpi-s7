/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

/*jshint esversion: 6, node: true*/

const SerialPort = require('serialport');
const PPPParser = require('./pppParser.js');
const PPPSerializer = require('./pppSerializer.js');

const util = require('util');
const debug = util.debuglog('mpi-s7');


class PPPSocket extends SerialPort {

    constructor(path, opts) {
        debug("new PPPSocket");

        opts = opts || {};
        opts.autoOpen = false; //force NOT opening automatically

        //TODO callback should be for our init
        super(path, opts);

        this._pppParser = new PPPParser();
        this._pppSerializer = new PPPSerializer();
        this._queue = [];
        this._sequence = 0;
        this._msgOut = null;
        this._msgIn = null;
        this._opening = false;
        this._closing = false;
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
        this._pppSerializer.pipe(this);
        this.pipe(this._pppParser);
        /*this._pppSerializer.on('data', d => {
            debug('PPPSocket _pppSerializer#onData', d);
        });//*/
        /*this.on('data', d => {
            debug('PPPSocket #onData', d);
            this._pppParser.write(d);
        });//*/
        this.on('open', () => this._onOpen());
        this.on('close', e => {
            debug('PPPSocket #onClose', e);
            this._connected = false;
            //TODO
        });
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
                        this._closing = false;
                        this._onOpen();
                    } else {
                        super.close(e => {
                            if (e) {
                                this._closing.rej(e);
                            } else {
                                this._closing.res();
                            }
                        });
                    }
                } else {
                    if(this._opening){
                        this._opening.rej(new Error(`Error trying to disconnect before connecting with code [${data.seqId}]`));
                        this._opening = false;
                    } else {
                        this._closing.rej(new Error(`Disconnection failed with error code [${data.seqId}]`));
                    }
                }

            } else if (this._opening) {
                debug("PPPSocket _handleData _opening");
                if(data.seqId == 0xce){ //OK
                    this._connected = true;
                    this._opening.res();
                    this._opening = false;
                    this.emit('connect');

                } else if (data.seqId == 0xca) { //try again
                    if (this._opening.retries > this._maxRetry) {
                        this._opening.rej(new Error('Exceeded max retry times when connecting'));
                        this._opening = false;
                        return;
                    }
                    this._opening.retries += 1;
                    this._onOpen();

                } else if (data.seqId == 0xf8) { //closes, and try again
                    if(this._opening.retries > this._maxRetry){
                        this._opening.rej(new Error('Exceeded max retry times when connecting'));
                        this._opening = false;
                        return;
                    }
                    this._opening.retries += 1;

                    this._closing = true;
                    this._close();

                } else { //dont' know, reject it
                    this._opening.rej(new Error(`Connection rejected with code [${data.seqId}]`));
                    this._opening = false;
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
    
    // -----

    async open() {
        debug("PPPSocket open");
        return new Promise((res, rej) => {
            if(this._connected || this._opening || this._closing){
                rej(new Error('Open already called'));
                return;
            }

            this._opening = {res, rej, retries: 0};
            super.open();
        });
    }

    async close() {
        debug("PPPSocket close");
        return new Promise((res, rej) => {
            if(this._closing) {
                rej(new Error('Close already called'));
                return;
            }

            this._closing = {res, rej};
            this._close();

            //TODO should we timeout if we get no answer and close the port anyway?
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