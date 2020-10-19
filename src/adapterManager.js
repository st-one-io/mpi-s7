//@ts-check
/*
  Copyright: (c) 2019-2020, Guilherme Francescon Cittolin <gfcittolin@gmail.com>
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const { EventEmitter } = require('events');
const MPIAdapter = require('./mpi-adapter/mpiAdapter');
const usb = require('usb');
const util = require('util');

const debug = util.debuglog('mpi-s7');

const USB_VID_A1 = 0x0908;
const USB_PID_A1 = 0x0004;
const USB_VID_A2 = 0x0908;
const USB_PID_A2 = 0x01fe;

/** @typedef {import('usb').Device} Device */
/** @typedef {import('./mpi-adapter/mpiAdapter')} MPIAdapter */

/** @typedef {string} AdapterName a unique name for the adapter */

class AdapterManager extends EventEmitter {

    constructor() {
        debug("new AdapterManager");
        super();

        /** @type {Map<AdapterName,Device>} */
        this._usbDevs = null;
        /** @type {Map<AdapterName,MPIAdapter>} */
        this._adapters = null;
        this._inited = false;
        // holds the functions, so we can remove the listeners on them
        this._onUsbAttachListener = dev => this._onUsbAttach(dev);
        this._onUsbDetachListener = dev => this._onUsbDetach(dev);

        this.init();
    }

    /**
     * 
     * @param {Device} dev 
     */
    static isUsbMpiAdapter(dev) {
        let desc = dev && dev.deviceDescriptor;
        if (!desc) return false;

        return desc.idVendor === USB_VID_A1 && desc.idProduct === USB_PID_A1;
    }

    /**
     * 
     * @param {Device} dev 
     * @returns {AdapterName}
     */
    static getUniqueUsbName(dev) {
        let desc = dev && dev.deviceDescriptor;
        if (!desc) return null;

        let name;

        // portNumbers may not be supported
        if (dev.portNumbers !== null && dev.portNumbers !== undefined) {
            name = `usb/bus:${dev.busNumber}/port:${dev.portNumbers.join(':')}`;
        } else {
            name = `usb/bus:${dev.busNumber}/addr:${dev.deviceAddress}`;
        }

        debug("AdapterManager getUniqueUsbName", name);
        return name;
    }

    /**
     *
     * @param {Device} dev
     * @returns {Promise<AdapterName[]>}
     */
    static async getSecondaryNames(dev) {
        let desc = dev && dev.deviceDescriptor;
        if (!desc) return null;

        let names = [];

        try {
            dev.open();
            if (typeof desc.iSerialNumber === 'number') {
                let serial = await util.promisify(dev.getStringDescriptor)(desc.iSerialNumber);
                names.push(`usb/serial:${serial}`);
            }
            //TODO maybe more namings, like combining serial with path, or vid/pid, etc.
            dev.close();
        } catch (e) {
            dev.close();
        }

        debug("AdapterManager getSecondaryNames", names);
        return names;
    }

    /**
     * Initialize the manager by hooking to the usb events and
     * populating the internal state.
     * 
     * Hooking to usb events will prevent node from exiting
     * gracefully, you need to call `end()` to properly unhook
     * from the events
     */
    init() {
        debug("AdapterManager init", this._inited);

        if (this._inited) return;
        this._inited = true;
        this._usbDevs = new Map();
        this._adapters = new Map();

        usb.on('attach', this._onUsbAttachListener);
        usb.on('detach', this._onUsbDetachListener);
        //@ts-ignore
        usb.unrefHotplugEvents();

        usb.getDeviceList().forEach(d => this._onUsbAttach(d));
    }

    /**
     * Detaches all events and cleanup internal state, so that
     * the process can exit gracefully
     */
    end() {
        debug("AdapterManager end", this._inited);

        if (!this._inited) return;

        usb.removeListener('attach', this._onUsbAttachListener);
        usb.removeListener('detach', this._onUsbDetachListener);
        this._usbDevs = null;
        this._adapters = null;
        this._inited = false;
    }

    /**
     * @returns {AdapterName[]}
     */
    getAvailableAdapters() {
        if (!this._usbDevs) return [];

        return Array.from(this._usbDevs.keys());
    }

    /**
     * Gets the named adapter, or the first adapder available
     * if name is not provided. Returns null if no adapter was
     * found
     * @param {AdapterName} [name]
     * @returns {MPIAdapter}
     */
    getAdapter(name) {
        if (!this._usbDevs || !this._adapters) return null;

        if (name) {
            if (this._adapters.has(name)) {
                return this._adapters.get(name);
            }

            if (this._usbDevs.has(name)) {
                let dev = this._usbDevs.get(name);
                let adapter = new MPIAdapter(dev);
                this._adapters.set(name, adapter);
                return adapter;
            }
        }

        if (this._adapters.size > 0) {
            return this._adapters.values().next().value;
        }

        if (this._usbDevs.size > 0) {
            let [devName, dev] = this._usbDevs.entries().next().value;
            let adapter = new MPIAdapter(dev);
            this._adapters.set(devName, adapter);
            return adapter;
        }

        return null;
    }

    /**
     * @private
     * @param {Device} dev 
     */
    _onUsbAttach(dev) {
        debug("AdapterManager _onUsbAttach");
        if (!AdapterManager.isUsbMpiAdapter(dev)) return;

        let devName = AdapterManager.getUniqueUsbName(dev);
        this._usbDevs.set(devName, dev);

        this.emit('attach', devName);
    }

    /**
     * @private
     * @param {Device} dev 
     */
    _onUsbDetach(dev) {
        debug("AdapterManager _onUsbDetach");
        if (!AdapterManager.isUsbMpiAdapter(dev)) return;

        let devName = AdapterManager.getUniqueUsbName(dev);

        if (this._adapters.has(devName)) {
            let adapter = this._adapters.get(devName);
            adapter._detach();
        }
        this._adapters.delete(devName);
        this._usbDevs.delete(devName);

        this.emit('detach', devName);
    }
}

debug("create AdapterManager");
module.exports = new AdapterManager();