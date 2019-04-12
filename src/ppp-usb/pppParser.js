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

class PPPParser extends Transform {

    constructor(opts) {
        opts = opts || {};
        opts.readableObjectMode = true;
        opts.decodeStrings = true;

        super(opts);

        this._nBuffer = null;
        debug("new PPPParser");
    }

    _transform(chunk, encoding, cb) {
        debug("PPPParser _transform", chunk);

        let ptr = 0;

        if (this._nBuffer !== null) {
            debug("PPPParser _transform join-pkt", this._nBuffer, chunk);
            chunk = Buffer.concat([this._nBuffer, chunk]);
            this._nBuffer = null;
        }

        // test for minimum length
        if (chunk.length < 5) {
            debug("PPPParser _transform skip-small-pkt", chunk.length);
            this._nBuffer = chunk;
            cb();
            return;
        }


        while (ptr < chunk.length) {
            let startPtr, startDelim, seqId, isControl, seqA, seqB, payload, chkSum, endDelim;
            
            startPtr = ptr;

            startDelim = chunk.readUInt8(ptr);
            if (startDelim !== 0x7E) {
                debug("PPPParser _transform wrong-delim-start", startDelim);
                cb(new Error(`Start of telegram must be 0x7E <> [0x${startDelim.toString(16)}]`));
                return;
            }
            ptr += 1;

            seqId = chunk.readUInt8(ptr);
            ptr += 1;

            isControl = !!(seqId & 0x80);
            seqA = (seqId & 0x70) >> 4;
            seqB = seqId & 0x07;

            if(!isControl){
                //size and payload only present in non-control telegrams

                let size = chunk.readUInt8(ptr);
                ptr += 1;

                let sizeCompl = chunk.readUInt8(ptr);
                ptr += 1;

                if (size + sizeCompl !== 0xff) {
                    debug("PPPParser _transform size-compl-mismatch", size, sizeCompl);
                    cb(new Error(`Complementary size fields mismatch [${size}] + [${sizeCompl}] != 0xFF`));
                    return;
                }

                if(ptr + size + 3 > chunk.length){
                    //we don't have enough data, buffer it back
                    debug("PPPParser _transform skip-small-pkt-2", ptr, size, chunk.length);
                    this._nBuffer = chunk.slice(ptr - 4);
                    cb();
                    return;
                }

                payload = chunk.slice(ptr, ptr + size);
                ptr += size;
            }

            chkSum = chunk.readUInt16LE(ptr);
            let chkSumCalc = crc16(chunk.slice(startPtr, ptr));
            if (chkSum != chkSumCalc) {
                debug("PPPParser _transform chksum-mismatch", chkSum, chkSumCalc);
                cb(new Error(`Telegram checksum [0x${chkSum.toString(16)}] != [0x${chkSumCalc.toString(16)}] calculated checksum`));
                return;
            }
            ptr += 2;

            endDelim = chunk.readUInt8(ptr);
            if (endDelim !== 0x7E) {
                debug("PPPParser _transform wrong-delim-end", endDelim);
                cb(new Error(`End of telegram must be 0x7E <> [0x${endDelim.toString(16)}]`));
                return;
            }
            ptr += 1;

            this.push({
                seqId,
                seqA,
                seqB,
                isControl,
                payload
            });
        }

        cb();
    }
}
debug("create PPPParser");
module.exports = PPPParser;