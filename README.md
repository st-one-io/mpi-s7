# mpi-s7

This library aims to implement all the protocols needed to communicate with MPI-USB adapters, used to communicate with some older PLCs from Siemens. It does not implement the "S7 communication" protocol, leaving it to other libraries.

This software is not affiliated with Siemens in any way, nor am I. S7-300, S7-400, S7-1200 and S7-1500 are trademarks of Siemens AG.

This node was created as part of the [ST-One](https://st-one.io) project.


## Disclaimer

**This is a work in progress.** Expect things to break, crash and burn. We cannot be hold liable for any damage to any equipment or issues directly or indirectly caused by this library. You've been warned.


## Install

This library depends on the [node-usb](https://github.com/tessel/node-usb) library, therefore their requirements apply here. Apart from that, you can currently install it by running

    npm install netsmarttech/mpi-s7

### Linux

Two main topics can cause you problem on Linux: Permissions and ModemManager. To avoid them, you can copy the udev rule `90-mpi-usb.rules` that is on the root folder of this project to `/etc/udev/rules.d`, and reload them with `udevadm control --reload`(or just restart your system).

The udev rule will:
 - Put the MPI-USB adapter on the `dialout` group, where most users already are
 - Set a flag that instructs ModemManager to ignore the adapter

Feel free to adjust the rule to your needs

### Windows

On Windows, you'll need to use [Zadig](http://zadig.akeo.ie/) to install a libusb-compatible driver to the MPI-USB adapter. After installing it, the adapter should be accessible from this library, but won't be accessible from other software anymore.


## Usage

**Warning:** this library currenlty offers a modified version of the [nodes7](https://github.com/plcpeople/nodeS7) interface as a shortcut for the implementation of the upper "S7 communication" protocol. In the near future the efforts will be merged with them, and we'll no longer offer it anymore. Expect a complete new API to interact with.

```js
const mpiS7 = require('.');

let conn = new mpiS7.NodeS7();

const variables = {
    TEST1: 'M0.7'
}

const opts = {
    mpiAddress: 6
}

function readAllItems() {
    conn.readAllItems((err, data) => {
        if (err) {
            console.log("Error reading values!", err);
        } else {
            console.log("Values:", data);
        }

        //don't forget to close connection before exiting!
        conn.dropConnection();
    })
}

conn.initiateConnection(opts, err => {
    if (err) {
        console.log("Error connecting to PLC!", err)
        return;
    }

    console.log("Connected to the PLC!");

    conn.setTranslationCB(tag => variables[tag]);
    conn.addItems(Object.keys(variables));

    readAllItems();
});
```

## Documentation

 - [Documentation](./docs/README.md)

## TODOs

Besides all `//TODO`s on the code, we have:

 - [ ] PPP - resend data if we don't get an ACK
 - [ ] PPP - implement max retries if don't get an ack


## License

Copyright: (c) 2019-2020, ST-One, Guilherme Francescon Cittolin <guilherme@st-one.io>

GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)