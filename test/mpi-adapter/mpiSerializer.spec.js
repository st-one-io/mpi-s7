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
const MPISerializer = require('../../src/mpi-adapter/mpiSerializer.js');
const C = require('../../src/mpi-adapter/mpiConstants.json');
const Stream = require('stream');

describe('MPI Serializer', () => {

    it('should be a stream', () => {
        expect(new MPISerializer()).to.be.instanceOf(Stream);
    });

    it('should create a new instance', () => {
        expect(new MPISerializer).to.be.instanceOf(Stream); //jshint ignore:line
    });

    /*it('should emit an error when input is not a buffer', (done) => {
        let serializer = new MPISerializer();
        serializer.on('error', (err) => {
            expect(err).to.be.an('error');
            done();
        });

        serializer.write({});
    });//*/

    it('should encode an adapter IDENTIFY request', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('010d02');
            done();
        });

        serializer.write({
            type: C.type.ADAPTER,
            command: C.adapter.command.IDENTIFY,
            direction: C.adapter.direction.REQUEST,

        });
    });

    it('should encode an adapter DISCONNECT request', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('010402');
            done();
        });

        serializer.write({
            type: C.type.ADAPTER,
            command: C.adapter.command.DISCONNECT,
            direction: C.adapter.direction.REQUEST,

        });
    });

    it('should encode an adapter BUS_SCAN request', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('010702');
            done();
        });

        serializer.write({
            type: C.type.ADAPTER,
            command: C.adapter.command.BUS_SCAN,
            direction: C.adapter.direction.REQUEST,

        });
    });

    it('should encode an adapter UNKNOWN_08 request', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('010802');
            done();
        });

        serializer.write({
            type: C.type.ADAPTER,
            command: C.adapter.command.UNKNOWN_08,
            direction: C.adapter.direction.REQUEST,

        });
    });

    it('should encode an adapter CONFIG_REQUEST request', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('010e02');
            done();
        });

        serializer.write({
            type: C.type.ADAPTER,
            command: C.adapter.command.CONFIG_REQUEST,
            direction: C.adapter.direction.REQUEST,

        });
    });

    it('should encode an adapter CONNECT request (localAddress: 0)', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('01030217009f013c0090011400000500000f0201010385ff0001000c0014003c000000');
            done();
        });

        serializer.write({
            type: C.type.ADAPTER,
            command: C.adapter.command.CONNECT,
            direction: C.adapter.direction.REQUEST,
            mpiLocalAddress: 0
        });
    });

    it('should encode an adapter CONNECT request (localAddress: 1)', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('01030217009f013c0090011400000500010f0201010385ff0001000c0014003c000000');
            done();
        });

        serializer.write({
            type: C.type.ADAPTER,
            command: C.adapter.command.CONNECT,
            direction: C.adapter.direction.REQUEST,
            mpiLocalAddress: 1
        });
    });

    it('should encode a bus CONNECTION_REQUEST (mpiAddress: 2, remoteId: 0x00, localId:0x14)', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0d 00 14 e0 04 00 80 00 02 00 02 01 00 01 00'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_REQUEST,
            mpiAddress: 2,
            remoteId: 0x00,
            localId: 0x14,
        });
    });

    it('should encode a bus CONNECTION_REQUEST (mpiAddress: 6, remoteId: 0x00, localId:0x14)', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 86 00 0d 00 14 e0 04 00 80 00 02 00 02 01 00 01 00'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_REQUEST,
            mpiAddress: 6,
            remoteId: 0x00,
            localId: 0x14,
        });
    });

    it('should encode a bus CONNECTION_REQUEST (mpiAddress: 2) with default remoteID and _defaultLocalId: 0x15', (done) => {
        let serializer = new MPISerializer({
            localId: 0x15
        });
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0d 00 15 e0 04 00 80 00 02 00 02 01 00 01 00'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_REQUEST,
            mpiAddress: 2
        });
    });

    it('should encode a bus CONNECTION_CONFIRM with default status (true)', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0c 12 14 05 01'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_CONFIRM,
            mpiAddress: 2,
            remoteId: 0x12,
            localId: 0x14
        });
    });

    it('should encode a bus CONNECTION_CONFIRM with status true', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0c 12 14 05 01'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_CONFIRM,
            mpiAddress: 2,
            remoteId: 0x12,
            localId: 0x14,
            status: true
        });
    });

    it('should encode a bus DATA_EXCHANGE (sequence: 0)', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0c 12 14 f1 00 32 01 00 00 02 00 00 08 00 00 f0 00 00 01 00 01 01 e0 '.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.DATA_EXCHANGE,
            mpiAddress: 2,
            remoteId: 0x12,
            localId: 0x14,
            payload: Buffer.from('32 01 00 00 02 00 00 08 00 00 f0 00 00 01 00 01 01 e0'.replace(/\s/g, ''), 'hex')
        });
    });

    it('should encode a bus DATA_EXCHANGE (sequence: 3)', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0c 12 14 f1 03 32 07 00 00 05 00 00 08 00 08 00 01 12 04 11 44 01 00 ff 09 00 04 01 11 00 01 '.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.DATA_EXCHANGE,
            mpiAddress: 2,
            remoteId: 0x12,
            localId: 0x14,
            sequence: 3,
            payload: Buffer.from('32 07 00 00 05 00 00 08 00 08 00 01 12 04 11 44 01 00 ff 09 00 04 01 11 00 01'.replace(/\s/g, ''), 'hex')
        });
    });

    it('should encode a bus DATA_ACK (sequence: 0) with default status', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0c 12 14 b0 01 00'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.DATA_ACK,
            mpiAddress: 2,
            remoteId: 0x12,
            localId: 0x14,
            sequence: 0
        });
    });

    it('should encode a bus DATA_ACK (sequence: 7) with status true', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0c 12 14 b0 01 07'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.DATA_ACK,
            mpiAddress: 2,
            remoteId: 0x12,
            localId: 0x14,
            sequence: 7,
            status: true
        });
    });

    it('should encode a bus DISCONNECTION_REQUEST', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0c 12 14 80'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.DISCONNECTION_REQUEST,
            mpiAddress: 2,
            remoteId: 0x12,
            localId: 0x14
        });
    });

    it('should encode a bus DISCONNECTION_CONFIRM', (done) => {
        let serializer = new MPISerializer();
        serializer.on('data', (data) => {
            expect(data.toString('hex')).to.be.equal('04 82 00 0c 14 12 c0'.replace(/\s/g, ''));
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.DISCONNECTION_CONFIRM,
            mpiAddress: 2,
            remoteId: 0x14,
            localId: 0x12
        });
    });

    it('should emit an error when a bus message has an invalid mpiAddress', (done) => {
        let serializer = new MPISerializer();
        serializer.on('error', (e) => {
            expect(e).to.be.an('error');
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_REQUEST,
            mpiAddress: -1,
            remoteId: 0x00,
            localId: 0x14
        });
    });

    it('should emit an error when a bus message has an invalid localId', (done) => {
        let serializer = new MPISerializer();
        serializer.on('error', (e) => {
            expect(e).to.be.an('error');
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_REQUEST,
            mpiAddress: 2,
            remoteId: 0x00,
            localId: -1
        });
    });

    it('should emit an error when a bus message has an invalid remoteId', (done) => {
        let serializer = new MPISerializer();
        serializer.on('error', (e) => {
            expect(e).to.be.an('error');
            done();
        });

        serializer.write({
            type: C.type.BUS,
            command: C.bus.command.CONNECTION_REQUEST,
            mpiAddress: 2,
            remoteId: -1,
            localId: 0x14
        });
    });
});