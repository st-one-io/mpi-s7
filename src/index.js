/*
  Copyright: (c) 2019, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const PppParser = require('./ppp-usb/pppParser.js');
const PppSerializer = require('./ppp-usb/pppSerializer.js');
const PppSocket = require('./ppp-usb/pppSocket.js');

const MpiParser = require('./mpi-adapter/mpiParser.js');
const MpiSerializer = require('./mpi-adapter/mpiSerializer.js');
const MpiAdapter = require('./mpi-adapter/mpiAdapter.js');
const MpiStream = require('./mpi-adapter/mpiStream.js');
const mpiConstants = require('./mpi-adapter/mpiConstants.json');

const NodeS7 = require('./nodeS7.js');

const usb = require('usb');

function getAdapter() {
    let usbDev = usb.findByIds(0x0908, 0x0004);

    if (!usbDev) {
        return null;
    }

    return new MpiAdapter(usbDev);
}

module.exports = {
    PppParser,
    PppSerializer,
    PppSocket,

    MpiParser,
    MpiSerializer,
    MpiAdapter,
    MpiStream,
    mpiConstants,

    NodeS7, 
    
    getAdapter
};