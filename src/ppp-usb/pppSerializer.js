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
const crc16 = require('./helper.js').crc16;

class PPPSerializer extends Transform {

    constructor(opts) {
        opts = opts || {};
        opts.writableObjectMode = true;

        super(opts);

        this._nBuffer = null;
        debug("new PPPSerializer");
    }

    _transform(chunk, encoding, cb) {
        debug("PPPSerializer _transform");

        this.serialize(chunk, (err, data) => {
            if(err) {
                cb(err);
            } else {
                this.push(data);
                cb();
            }
        });
    }

    serialize(chunk, cb) {
        debug("PPPSerializer serialize", chunk);

        let buf;

        let seqId = parseInt(chunk.seqId) || 0;
        let isControl = !!(seqId & 0x80);

        if(!isControl && !(chunk.payload instanceof Buffer)) {
            cb(new Error(`Missing buffer payload on non-control telegram`));
            return;
        }

        if(!isControl && chunk.payload.length > 0xff) {
            cb(new Error(`Payload bigger than allowed [${chunk.payload.length}] > 255`));
            return;
        }

        if (isControl) {
            buf = Buffer.alloc(5);
        } else {
            buf = Buffer.alloc(chunk.payload.length + 7);

            buf.writeUInt8(chunk.payload.length, 2);
            buf.writeUInt8(0xFF - chunk.payload.length, 3);
            chunk.payload.copy(buf, 4);
        }

        //start delimiter
        buf.writeUInt8(0x7E, 0);
        //seqId
        buf.writeUInt8(seqId, 1);
        
        //chksum
        let chksum = crc16(buf.slice(0, buf.length - 3));
        buf.writeUInt16LE(chksum, buf.length - 3);
        //end delimiter
        buf.writeUInt8(0x7E, buf.length - 1);
        
        debug("PPPSerializer serialize result", buf);
        cb(null, buf);
    }
}
debug("create PPPSerializer");
module.exports = PPPSerializer;