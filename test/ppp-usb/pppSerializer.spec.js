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
const PPPSerializer = require('../../src/ppp-usb/pppSerializer.js');
const Stream = require('stream');

describe('PPP-USB Serializer', () => {

    it('should be a stream', () => {
        expect(new PPPSerializer()).to.be.instanceOf(Stream);
    });

    it('should create a new instance', () => {
        expect(new PPPSerializer).to.be.instanceOf(Stream); //jshint ignore:line
    });

    /*it('should emit an error when input is not a buffer', (done) => {
        let parser = new PPPSerializer();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        parser.write({});
    });//*/

    it('should encode a control telegram (0xCE)', (done) => {
        let parser = new PPPSerializer();
        parser.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('7efc9bcd7e');
            done();
        });

        parser.write({seqId: 0xFC});
    });

    it('should encode a control telegram (0xCE)', (done) => {
        let parser = new PPPSerializer();
        parser.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('7ece0adf7e');
            done();
        });

        parser.write({seqId: 0xCE});
    });

    it('should encode a control telegram (0x89)', (done) => {
        let parser = new PPPSerializer();
        parser.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('7e89b1e97e');
            done();
        });

        parser.write({seqId: 0x89});
    });

    it('should encode a data telegram 1', (done) => {
        let parser = new PPPSerializer();
        parser.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('7e0003fc010d02eac37e');
            done();
        });

        parser.write({
            seqId: 0,
            payload: Buffer.from('010d02', 'hex')
        });
    });

    it('should encode a data telegram 2', (done) => {
        let parser = new PPPSerializer();
        parser.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('7e1123dc01030217009f013c0090011400000500000f0201010385ff0001000c0014003c00000014fe7e');
            done();
        });

        parser.write({
            seqId: 0x11,
            payload: Buffer.from('01030217009f013c0090011400000500000f0201010385ff0001000c0014003c000000', 'hex')
        });
    });

    it('should emit an error when telegram is not control and does not have payload', (done) => {
        let parser = new PPPSerializer();
        parser.on('error', (e) => {
            expect(e).to.be.an('error');
            done();
        });

        parser.write({
            seqId: 0x3C
        });
    });

    it('should emit an error when payload is too big', (done) => {
        let parser = new PPPSerializer();
        parser.on('error', (e) => {
            expect(e).to.be.an('error');
            done();
        });

        parser.write({
            seqId: 0x3C,
            payload: Buffer.alloc(256).fill(0x5a)
        });
    });
});