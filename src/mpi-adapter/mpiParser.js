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

class MPIParser extends Transform {

    constructor(opts) {
        opts = opts || {};
        opts.readableObjectMode = true;
        opts.writableObjectMode = true;

        super(opts);

        debug("new MPIParser");
    }

    _transform(chunk, encoding, cb) {
        debug("MPIParser _transform", chunk);
        this.parse(chunk, (err, data) => {
            if(err){
                cb(err);
            } else {
                this.push(data);
                cb();
            }
        });
    }

    parseAsync(chunk) {
        debug("MPIParser parseAsync", chunk);
        return new Promise((resolve, reject) => {
            this.parse(chunk, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    parse(chunk, cb) {
        debug("MPIParser parse", chunk);

        let ptr = 0, obj = {};

        if(!Buffer.isBuffer(chunk)){
            cb(new Error('Chunk must be of type Buffer'));
            return;
        }

        obj.type = chunk.readUInt8(ptr);
        ptr += 1;

        switch(obj.type) {
            case C.type.ADAPTER:
                obj.command = chunk.readUInt8(ptr);
                ptr += 1;
                obj.direction = chunk.readUInt8(ptr);
                ptr++;

                if (obj.direction !== C.adapter.direction.RESPONSE) {
                    cb(new Error(`Still can't parse directions other than RESPONSE 0x20 != [0x${obj.direction.toString(16)}]`));
                    return;
                }

                switch (obj.command) {
                    case C.adapter.command.BUS_SCAN:
                        ptr += 2; //skip 2 unknown bytes
                        obj._maxBusId = chunk.readUInt8(ptr);
                        ptr += 1;
                        obj.payload = [];
                        for(let i = 0; ptr < chunk.length; ptr++, i++) {
                            if(chunk.readUInt8(ptr) == 0x30) { //0x30 means used
                                obj.payload.push(i);
                            }
                        }

                        break;
                    case C.adapter.command.CONNECT:
                    case C.adapter.command.IDENTIFY:
                        obj.payload = chunk.toString('ascii', ptr);
                        break;
                    case C.adapter.command.DISCONNECT:
                        break;
                    default:
                        obj.payload = chunk.slice(ptr);
                }

                break;
            case C.type.BUS:
                if(chunk.length < 6) {
                    debug("MPIParser _transform err-busdata-small", chunk.length, chunk);
                    cb(new Error(`Incoming data too small for a bus type telegram [0x${obj.direction.toString(16)}]`));
                    return;
                }

                obj.mpiAddress = chunk.readUInt8(ptr) & 0x7f;
                ptr += 1;
                //direction
                ptr += 1;
                //subtype
                ptr += 1;
                obj.remoteId = chunk.readUInt8(ptr);
                ptr += 1;
                obj.localId = chunk.readUInt8(ptr);
                ptr += 1;
                obj.command = chunk.readUInt8(ptr);
                ptr += 1;

                switch(obj.command){
                    //case C.bus.command.CONNECTION_REQUEST:
                    case C.bus.command.CONNECTION_RESPONSE:
                        //we don't know what anything means... :(
                        break;

                    case C.bus.command.CONNECTION_CONFIRM:
                        obj.status = chunk.readUInt8(ptr) == 0x01;
                        ptr += 1;
                        break;

                    case C.bus.command.DATA_EXCHANGE:
                        obj.sequence = chunk.readUInt8(ptr);
                        ptr += 1;
                        obj.payload = chunk.slice(ptr);
                        ptr += obj.payload.length;
                        break;

                    case C.bus.command.DATA_ACK:
                        obj.status = chunk.readUInt8(ptr) == 0x01;
                        ptr += 1;
                        obj.sequence = chunk.readUInt8(ptr);
                        ptr += 1;
                        break;
                    
                    case C.bus.command.DISCONNECTION_REQUEST:
                    case C.bus.command.DISCONNECTION_CONFIRM:
                        //no extra data
                        break;
                    
                    default:
                        debug("MPIParser _transform err-unknown-bus-command", chunk);
                        cb(new Error(`Unknown bus command [0x${obj.command.toString(16)}]`));
                        return;
                }

                break;
            default:
                debug("MPIParser _transform err-unknown-type", header.type);
                cb(new Error(`Unknown telegram type [${obj.type}]`));
                return;
        }

        cb(null, obj);
    }
}
module.exports = MPIParser;