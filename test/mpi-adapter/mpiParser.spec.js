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
const MPIParser = require('../../src/mpi-adapter/mpiParser.js');
const C = require('../../src/mpi-adapter/mpiConstants.json');
const Stream = require('stream');

describe('MPI Parser', () => {

    it('should be a stream', () => {
        expect(new MPIParser()).to.be.instanceOf(Stream);
    });

    it('should create a new instance', () => {
        expect(new MPIParser).to.be.instanceOf(Stream); //jshint ignore:line
    });

    it('should emit an error when input is not a buffer', (done) => {
        let parser = new MPIParser();
        parser.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        parser.write({});
    });

    it('should decode an adapter IDENTIFY response', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.ADAPTER,
                command: C.adapter.command.IDENTIFY,
                direction: C.adapter.direction.RESPONSE,
                payload: "V00.85"
            });
            done();
        });

        parser.write(Buffer.from('010d205630302e3835', 'hex'));
    });

    it('should decode an adapter CONNECT response', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.ADAPTER,
                command: C.adapter.command.CONNECT,
                direction: C.adapter.direction.RESPONSE,
                payload: "V00.85"
            });
            done();
        });

        parser.write(Buffer.from('0103205630302e3835', 'hex'));
    });

    it('should decode an adapter CONFIG_REQUEST response', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.ADAPTER,
                command: C.adapter.command.CONFIG_REQUEST,
                direction: C.adapter.direction.RESPONSE,
                payload: Buffer.from('0200011e010001ffff0003019f00140190000c00002700051f02020035010901091c000000ffffffffffffffffffffffffffffffffffffffffffffffff', 'hex')
            });
            done();
        });

        parser.write(Buffer.from('010e200200011e010001ffff0003019f00140190000c00002700051f02020035010901091c000000ffffffffffffffffffffffffffffffffffffffffffffffff', 'hex'));
    });

    it('should decode an adapter CONNECT response', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.ADAPTER,
                command: C.adapter.command.CONNECT,
                direction: C.adapter.direction.RESPONSE,
                payload: "V00.85"
            });
            done();
        });

        parser.write(Buffer.from('0103205630302e3835', 'hex'));
    });

    it('should decode an adapter BUS_SCAN response', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.ADAPTER,
                command: C.adapter.command.BUS_SCAN,
                direction: C.adapter.direction.RESPONSE,
                _maxBusId: 0x1f,
                payload: [0, 2]
            });
            done();
        });

        parser.write(Buffer.from('01072000001f30103010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010', 'hex'));
    });

    it('should decode an adapter DISCONNECT response', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.ADAPTER,
                command: C.adapter.command.DISCONNECT,
                direction: C.adapter.direction.RESPONSE
            });
            done();
        });

        parser.write(Buffer.from('010420', 'hex'));
    });

    it('should decode a bus CONNECTION_RESPONSE', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.BUS,
                mpiAddress: 2,
                remoteId: 0x14,
                localId: 0x12,
                command: C.bus.command.CONNECTION_RESPONSE
            });
            done();
        });

        parser.write(Buffer.from('0482800c1412d00400800002000201000100', 'hex'));
    });

    it('should decode a bus CONNECTION_CONFIRM - positive status', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.BUS,
                mpiAddress: 2,
                remoteId: 0x14,
                localId: 0x12,
                command: C.bus.command.CONNECTION_CONFIRM,
                status: true
            });
            done();
        });

        parser.write(Buffer.from('0482800c14120501', 'hex'));
    });

    it('should decode a bus DATA_EXCHANGE', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.BUS,
                mpiAddress: 2,
                remoteId: 0x14,
                localId: 0x12,
                command: C.bus.command.DATA_EXCHANGE,
                sequence: 0,
                payload: Buffer.from('320300000200000800000000f0000001000100f0', 'hex')
            });
            done();
        });

        parser.write(Buffer.from('0482800c1412f100320300000200000800000000f0000001000100f0', 'hex'));
    });

    it('should decode a bus DATA_ACK', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.BUS,
                mpiAddress: 2,
                remoteId: 0x14,
                localId: 0x12,
                command: C.bus.command.DATA_ACK,
                status: true,
                sequence: 0
            });
            done();
        });

        parser.write(Buffer.from('0482800c1412b00100', 'hex'));
    });

    it('should decode a bus DISCONNECTION_REQUEST', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.BUS,
                mpiAddress: 2,
                remoteId: 0x12,
                localId: 0x14,
                command: C.bus.command.DISCONNECTION_REQUEST
            });
            done();
        });

        parser.write(Buffer.from('0482000c121480', 'hex'));
    });

    it('should decode a bus DISCONNECTION_CONFIRM', (done) => {
        let parser = new MPIParser();
        parser.on('data', (data) => {
            expect(data).to.be.deep.equal({
                type: C.type.BUS,
                mpiAddress: 2,
                remoteId: 0x14,
                localId: 0x12,
                command: C.bus.command.DISCONNECTION_CONFIRM
            });
            done();
        });

        parser.write(Buffer.from('0482800c1412c0', 'hex'));
    });
});