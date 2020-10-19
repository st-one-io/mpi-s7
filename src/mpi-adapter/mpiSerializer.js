/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

/*jshint esversion: 6, node: true*/

const {
    Transform
} = require('stream');
const util = require('util');
const debug = util.debuglog('mpi-s7');
const C = require('./mpiConstants.json');

const DEFAULT_LOCAL_ID = 0x14;

function isValid(elm, obj) {
    if (elm === undefined || elm === null) {
        return false;
    }
    if (obj) {
        return !!Object.values(obj).find(e => e == elm);
    }
    return true;
}

/**
 * @typedef {object} ConnectionParams
 * @param {number} ttr
 * @param {number} tslot
 * @param {number} tid1
 * @param {number} tid2
 * @param {number} trdy
 * @param {number} tquit
 * @param {number} gapFactor
 * @param {number} busSpeed
 * @param {number} localBusAddr
 * @param {number} maxBusAddr
 * @param {number} retryLimit
 * @param {number} busType
 * @param {number} flags
 * @param {number} [profile]
 */

const adapterConnectParams = [
    { param: 'ttr', width: 2, offset: 3 },
    { param: 'tslot', width: 2, offset: 5 },
    { param: 'tid1', width: 2, offset: 7 },
    { param: 'tid2', width: 2, offset: 9 },
    { param: 'trdy', width: 2, offset: 11 },
    { param: 'tqui', width: 1, offset: 13 },
    { param: 'gapFactor', width: 1, offset: 14 },
    { param: 'busSpeed', width: 1, offset: 15 },
    { param: 'localBusAddr', width: 1, offset: 16 },
    { param: 'maxBusAddr', width: 1, offset: 17 },
    { param: 'retryLimit', width: 1, offset: 18 },
    { param: 'busType', width: 1, offset: 20 },
    { param: 'flags', width: 1, offset: 22 }
]

class MPISerializer extends Transform {

    constructor(opts) {
        opts = opts || {};
        opts.writableObjectMode = true;

        super(opts);

        this._nBuffer = null;
        this._defaultLocalId = (opts.localId !== undefined && opts.localId !== null) ? opts.localId : DEFAULT_LOCAL_ID;
        debug("new MPISerializer");
    }

    _transform(chunk, encoding, cb) {
        debug("MPISerializer _transform");

        this.serialize(chunk, (err, data) => {
            if (err) {
                cb(err);
            } else {
                this.push(data);
                cb();
            }
        });
    }

    async serializeAsync(chunk) {
        return new Promise((resolve, reject) => {
            this.serialize(chunk, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    serialize(chunk, cb) {
        debug("MPISerializer serialize", chunk);

        let buf;

        if (!chunk) {
            cb(new Error('Input required to serialize'));
        }

        switch (chunk.type) {
            case C.type.ADAPTER:
                if (chunk.direction && chunk.direction !== C.adapter.direction.REQUEST) {
                    cb(new Error(`Unsupported adapter command direction [${chunk.direction}] != (0x02) REQUEST`));
                }

                switch (chunk.command) {
                    case C.adapter.command.DISCONNECT:
                    case C.adapter.command.BUS_SCAN:
                    case C.adapter.command.UNKNOWN_08:
                    case C.adapter.command.IDENTIFY:
                    case C.adapter.command.CONFIG_REQUEST:
                        buf = Buffer.alloc(3);
                        break;
                    case C.adapter.command.CONNECT:

                        if (chunk.raw instanceof Buffer) {
                            buf = Buffer.concat([Buffer.from('010302'), chunk.raw])
                        } else {

                            const isExtended = chunk.profile !== undefined && chunk.profile !== null && !isNaN(chunk.profile);

                            buf = Buffer.allocUnsafe(isExtended ? 35 : 23);

                            // write fixed/constant parts
                            buf.writeUInt8(1, 19);
                            buf.writeUInt8(3, 21);

                            // write parameters
                            for (const entry of adapterConnectParams) {
                                const val = chunk[entry.param];
                                //validate entry
                                if (val === null || val === undefined || isNaN(val)) {
                                    throw new Error(`Invalid or missing parameter [${entry.param}] for connecting to the adapter`);
                                }

                                buf.writeUIntLE(val, entry.offset, entry.width);
                            }

                            if (isExtended) {
                                buf.writeUInt8(chunk.profile, 23);
                                buf.write('0001000C0014003C000000', 24, 'hex');
                            }
                        }

                        break;
                    default:
                        cb(new Error(`Unsupported adapter command [${chunk.command}]`));
                        return;
                }

                // write command
                buf.writeUInt8(chunk.command, 1);
                // write direction
                buf.writeUInt8(C.adapter.direction.REQUEST, 2);

                break;


            case C.type.BUS:

                let mpiAddress = parseInt(chunk.mpiAddress);
                if (isNaN(mpiAddress) || mpiAddress < 0 || mpiAddress > 0x7f) {
                    cb(new Error(`Invalid MPI Address [${chunk.mpiAddress}]`));
                    return;
                }

                let localId = parseInt(chunk.localId) || this._defaultLocalId;
                if (isNaN(localId) || localId < 0 || localId > 0xff) {
                    cb(new Error(`Invalid Local ID [${chunk.localId}]`));
                    return;
                }

                let remoteId = parseInt(chunk.remoteId) || 0;
                if (isNaN(remoteId) || remoteId < 0 || remoteId > 0xff) {
                    cb(new Error(`Invalid Remote ID [${chunk.remoteId}]`));
                    return;
                }

                let subtype = C.bus.subtype.CONNECTED_DATA;

                switch (chunk.command) {
                    case C.bus.command.CONNECTION_REQUEST:
                        subtype = C.bus.subtype.UNCONNECTED_DATA;

                        let rack = parseInt(chunk.rack) || 0;
                        let slot = 2;
                        if (isValid(chunk.slot)) {
                            slot = parseInt(chunk.slot);
                        }

                        let commType = 1; //(1=PG 2=OP 3=S7Basic)
                        if (isValid(chunk.commType, C.bus.connection.commType)) {
                            commType = parseInt(chunk.commType);
                        }

                        buf = Buffer.allocUnsafe(18);
                        buf.writeUInt8(0x04, 7); //size of the next two?
                        buf.writeInt16BE(0x0080, 8);
                        buf.writeInt16BE(0x0002, 10);
                        buf.writeUInt8(0x00, 12); //0x01 if using routing
                        buf.writeUInt8(0x02, 13); //size of the routing data???
                        buf.writeInt16BE(0x0100, 14);
                        buf.writeUInt8(commType, 16); //communication type
                        buf.writeUInt8(0, 17); //rack+slot

                        break;

                    //case C.bus.command.CONNECTION_RESPONSE: //answer only, won't implement for now
                    case C.bus.command.CONNECTION_CONFIRM:
                        let ccStatus = true;
                        if (isValid(chunk.status)) {
                            ccStatus = !!chunk.status;
                        }

                        buf = Buffer.alloc(8);
                        buf.writeUInt8(ccStatus ? 0x01 : 0xff, 7); // 0x01 == OK, not sure about 0xff
                        break;

                    case C.bus.command.DATA_EXCHANGE:
                        if (!(chunk.payload instanceof Buffer)) {
                            cb(new Error(`Payload required for a data exchange telegram`));
                            return;
                        }

                        let dataSeq = parseInt(chunk.sequence) || 0;
                        if (isNaN(dataSeq) || dataSeq < 0 || dataSeq > 0xff) {
                            cb(new Error(`Invalid telegram sequence [${chunk.sequence}]`));
                            return;
                        }

                        buf = Buffer.alloc(8 + chunk.payload.length);
                        buf.writeUInt8(dataSeq, 7);
                        buf.writeUInt8(0x02, 2); //direction?? mpiBusAddr??? //XXX //TODO
                        chunk.payload.copy(buf, 8);
                        break;

                    case C.bus.command.DATA_ACK:
                        let ackSeq = parseInt(chunk.sequence) || 0;
                        if (isNaN(ackSeq) || ackSeq < 0 || ackSeq > 0xff) {
                            cb(new Error(`Invalid telegram sequence [${chunk.sequence}]`));
                            return;
                        }

                        let ackStatus = true;
                        if (isValid(chunk.status)) {
                            ackStatus = !!chunk.status;
                        }

                        buf = Buffer.alloc(9);
                        buf.writeUInt8(ackStatus ? 0x01 : 0xff, 7);
                        buf.writeUInt8(ackSeq, 8);
                        break;

                    case C.bus.command.DISCONNECTION_REQUEST:
                    case C.bus.command.DISCONNECTION_CONFIRM:
                        buf = Buffer.alloc(7);
                        //no extra data
                        break;

                    default:
                        cb(new Error(`Unsupported command [${chunk.command}] for bus data`));
                        return;
                }

                // write "header" common to all
                buf.writeUInt8(0x80 | mpiAddress, 1);
                buf.writeUInt8(0, 2); //direction??
                buf.writeUInt8(subtype, 3);
                buf.writeUInt8(remoteId, 4);
                buf.writeUInt8(localId, 5);
                buf.writeUInt8(chunk.command, 6);

                break;


            default:
                cb(new Error(`Unsupported telegram type [${chunk.type}]`));
                return;
        }

        //write type
        buf.writeUInt8(chunk.type, 0);

        cb(null, buf);
    }
}
module.exports = MPISerializer;