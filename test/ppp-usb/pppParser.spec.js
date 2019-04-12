/*
    Copyright (c) 2018 Guilherme Francescon Cittolin

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/
/*jshint esversion: 6, node: true*/

const {
    expect
} = require('chai');
const PPPParser = require('../../src/ppp-usb/pppParser.js');
const Stream = require('stream');

describe('PPP-USB Parser', () => {

    it('should be a stream', () => {
        expect(new PPPParser()).to.be.instanceOf(Stream);
    });

    it('should create a new instance', () => {
        expect(new PPPParser).to.be.instanceOf(Stream); //jshint ignore:line
    });

    it('should emit an error when input is not a buffer', (done) => {
        let parser = new PPPParser();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        parser.write({});
    });

    it('should decode a control telegram (0xFC)', (done) => {
        let parser = new PPPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                seqId: 0xFC,
                seqA: 7,
                seqB: 4,
                isControl: true,
                payload: undefined
            });
            done();
        });

        parser.write(Buffer.from('7efc9bcd7e', 'hex'));
    });

    it('should decode a control telegram (0xCE)', (done) => {
        let parser = new PPPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                seqId: 0xCE,
                seqA: 4,
                seqB: 6,
                isControl: true,
                payload: undefined
            });
            done();
        });

        parser.write(Buffer.from('7ece0adf7e', 'hex'));
    });

    it('should decode a control telegram (0x89)', (done) => {
        let parser = new PPPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                seqId: 0x89,
                seqA: 0,
                seqB: 1,
                isControl: true,
                payload: undefined
            });
            done();
        });

        parser.write(Buffer.from('7e89b1e97e', 'hex'));
    });

    it('should decode a control telegram (0x8C)', (done) => {
        let parser = new PPPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                seqId: 0x8C,
                seqA: 0,
                seqB: 4,
                isControl: true,
                payload: undefined
            });
            done();
        });

        parser.write(Buffer.from('7e8c1cbe7e', 'hex'));
    });

    it('should decode a data telegram 1', (done) => {
        let parser = new PPPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                seqId: 0,
                seqA: 0,
                seqB: 0,
                isControl: false,
                payload: Buffer.from('010d02', 'hex')
            });
            done();
        });

        parser.write(Buffer.from('7e0003fc010d02eac37e', 'hex'));
    });

    it('should decode a data telegram 2', (done) => {
        let parser = new PPPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                seqId: 0x11,
                seqA: 1,
                seqB: 1,
                isControl: false,
                payload: Buffer.from('01030217009f013c0090011400000500000f0201010385ff0001000c0014003c000000', 'hex')
            });
            done();
        });

        parser.write(Buffer.from('7e1123dc01030217009f013c0090011400000500000f0201010385ff0001000c0014003c00000014fe7e', 'hex'));
    });

    it('should decode two data telegrams in a single buffer', (done) => {
        let parser = new PPPParser();
        res = [];
        parser.on('data', (data) => {
            res.push(data);
            if (res.length > 1) {
                expect(res).to.be.deep.equal([{
                    seqId: 0,
                    seqA: 0,
                    seqB: 0,
                    isControl: false,
                    payload: Buffer.from('010d02', 'hex')
                }, {
                    seqId: 0x11,
                    seqA: 1,
                    seqB: 1,
                    isControl: false,
                    payload: Buffer.from('01030217009f013c0090011400000500000f0201010385ff0001000c0014003c000000', 'hex')
                }]);
                done();
            }
        });

        parser.write(Buffer.from('7e0003fc010d02eac37e7e1123dc01030217009f013c0090011400000500000f0201010385ff0001000c0014003c00000014fe7e', 'hex'));
    });

    it('should decode a large data telegram split in two writes', (done) => {
        let parser = new PPPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                seqId: 0x11,
                seqA: 1,
                seqB: 1,
                isControl: false,
                payload: Buffer.from('01030217009f013c0090011400000500000f0201010385ff0001000c0014003c000000', 'hex')
            });
            done();
        });

        parser.write(Buffer.from('7e1123dc01030217009f013c0090011400000500000f', 'hex'));
        parser.write(Buffer.from('0201010385ff0001000c0014003c00000014fe7e', 'hex'));
    });

    it('should decode a large data telegram split in two writes - first one is very short', (done) => {
        let parser = new PPPParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                seqId: 0x11,
                seqA: 1,
                seqB: 1,
                isControl: false,
                payload: Buffer.from('01030217009f013c0090011400000500000f0201010385ff0001000c0014003c000000', 'hex')
            });
            done();
        });

        parser.write(Buffer.from('7e11', 'hex'));
        parser.write(Buffer.from('23dc01030217009f013c0090011400000500000f', 'hex'));
        parser.write(Buffer.from('0201010385ff0001000c0014003c00000014fe7e', 'hex'));
    });

    it('should emit an error when input does not start with 0x7e', (done) => {
        let parser = new PPPParser();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        parser.write(Buffer.from('7b1123dc01030217009f013c0090011400000500000f0201010385ff0001000c0014003c00000014fe7e', 'hex'));
    });

    it('should emit an error when input\'s size bytes does not add up to 0xff', (done) => {
        let parser = new PPPParser();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        parser.write(Buffer.from('7e1123cd01030217009f013c0090011400000500000f0201010385ff0001000c0014003c00000014fe7e', 'hex'));
    });

    it('should emit an error when checksum does not match', (done) => {
        let parser = new PPPParser();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        parser.write(Buffer.from('7e1123dc01030217009f013c0090011400000500000f0201010385ff0001000c0014003c00000014ef7e', 'hex'));
    });

    it('should emit an error when telegram does not end with 0x7e', (done) => {
        let parser = new PPPParser();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        parser.write(Buffer.from('7e0003fc010d02eac3e7', 'hex'));
    });

    it('should emit an error when telegram does not end with 0x7e - has a byte too much', (done) => {
        let parser = new PPPParser();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        parser.write(Buffer.from('7e0003fc010d02eac3ff7e', 'hex'));
    });
});