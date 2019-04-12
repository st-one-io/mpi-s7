# MPI communication samples 

## Captures
 - step7_mpi_1: sample capture from Step7
 - step7_mpi_2: Performs bus scan, PLC connection, variable reading, other readings, disconnect
 - step7_mpi_3: Change MPI Address from 2 to 6: scan bus (to select to which PLC to download), download, connects and reads HW and variables
 - step7_mpi_4: Bus scan and connect (mode: Auto; selfMpiAddr: 1; timeout: 30s)
 - step7_mpi_5: Bus scan and connect (mode: Auto; selfMpiAddr: 0; timeout: 10s)
 - step7_mpi_6: Bus scan and connect (mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false)
 - step7_mpi_7: Bus scan and connect (mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: true)
 - step7_mpi_8: Bus scan and connect (mode: MPI ; selfMpiAddr: 0; timeout: 10s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false)
 - step7_mpi_9: Bus scan and connect (mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 63; onlyMasterInBus: false)
 - step7_mpi_10: Bus scan and connect (mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 126; onlyMasterInBus: false)
 - step7_mpi_11: Bus scan and connect (mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 15; onlyMasterInBus: false)
 - step7_mpi_12: Bus scan and connect (mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 19.2K; maxMpiAddr: 31; onlyMasterInBus: false)
 - step7_mpi_13: Bus scan and connect (mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 1.5M; maxMpiAddr: 31; onlyMasterInBus: false)
 - step7_mpi_14: Bus scan and connect (mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false)

## Notes

ModemManager usually tries to detect a modem, and messes up with our devie. We can blacklist it by adding a udev rule (https://linux-tips.com/t/prevent-modem-manager-to-capture-usb-serial-devices/284)

    ATTRS{idVendor}=="0908" ATTRS{idProduct}=="0004", ENV{ID_MM_DEVICE_IGNORE}="1"


## MPI-ADAPTER Frame
- 01 03 02: adapter connect request
- 01 03 20: adapter connect response (payload: Version)
- 01 04 02: adapter disconnect request
- 01 04 20: adapter disconnect response

### Connect request analysis

01 03 02 
ff ff // ttr (value*256) (maxBusAddr + 8 on MPI)
90 01 // 0x0190 - tslot
c3 00 // 0x00c3 - tid1
68 01 // 0x0168 - tid2
50 00 // 0x0050 - trdy
00 // always 0 ???
14 // gapFactor
02 00 1f 01 01 01 03 83 02 00 01 00 0c 00 14 00 3c 00 00 00


### Connect request samples

// mode: Auto; selfMpiAddr: 0; timeout: 30s
out 01 03 02 17 00 9f 01 3c 00 90 01 14 00 00 05 00 00 0f 02 01 01 03 85 ff 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: Auto; selfMpiAddr: 1; timeout: 30s
out 01 03 02 17 00 9f 01 3c 00 90 01 14 00 00 05 00 01 0f 02 01 01 03 85 ff 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: Auto; selfMpiAddr: 0; timeout: 10s
out 01 03 02 17 00 9f 01 3c 00 90 01 14 00 00 05 00 00 0f 02 01 01 03 85 ff 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false
out 01 03 02 27 00 9f 01 3c 00 90 01 14 00 00 05 02 00 1f 02 01 01 03 81
in  01 03 20 56 30 30 2e 38 35

// mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: true
out 01 03 02 27 00 9f 01 3c 00 90 01 14 00 00 05 02 00 1f 02 01 01 03 80
in  01 03 20 56 30 30 2e 38 35

// mode: MPI ; selfMpiAddr: 0; timeout: 10s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false
out 01 03 02 27 00 9f 01 3c 00 90 01 14 00 00 05 02 00 1f 02 01 01 03 81
in  01 03 20 56 30 30 2e 38 35

// mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 63; onlyMasterInBus: false
out 01 03 02 47 00 9f 01 3c 00 90 01 14 00 00 05 02 00 3f 02 01 01 03 81
in  01 03 20 56 30 30 2e 38 35

// mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 126; onlyMasterInBus: false
out 01 03 02 86 00 9f 01 3c 00 90 01 14 00 00 05 02 00 7e 02 01 01 03 81
in  01 03 20 56 30 30 2e 38 35

// mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 15; onlyMasterInBus: false
out 01 03 02 17 00 9f 01 3c 00 90 01 14 00 00 05 02 00 0f 02 01 01 03 81
in  01 03 20 56 30 30 2e 38 35

// mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 19.2K; maxMpiAddr: 31; onlyMasterInBus: false
out 01 03 02 27 00 64 00 25 00 3c 00 16 00 00 0a 01 00 1f 01 01 01 03 81
in  01 03 20 45 3d 30 33 31 33

// mode: MPI ; selfMpiAddr: 0; timeout: 30s; busSpeed: 1.5M; maxMpiAddr: 31; onlyMasterInBus: false
out 01 03 02 27 00 a4 01 3c 00 90 01 14 00 00 05 04 00 1f 02 01 01 03 81 ff 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false
//  tslot: 100(0x64); maxTsdr: 60(0x3c); minTsdr: 12(0x0c); tset: 1; tqui: 0; gapFactor: 10(0x0a); retryLimit: 1
//    tid2: 60(0x3c); trdy: 11(0x0b); tid1: 37(0x25)
out 01 03 02 ff ff 64 00 25 00 3c 00 0b 00 00 0a 02 00 1f 01 01 01 03 83 00 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false
//  tslot: 400(0x190); maxTsdr: 360(0x168); minTsdr: 81(0x51); tset: 80(0x50); tqui: 0; gapFactor: 20(0x14); retryLimit: 1
//    tid2: 360(0x168); trdy: 80(0x50); tid1: 195(0xc3)
out 01 03 02 ff ff 90 01 c3 00 68 01 50 00 00 14 02 00 1f 01 01 01 03 83 02 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false
//  tslot: 400(0x190); maxTsdr: 360(0x168); minTsdr: 81(0x51); tset: 80(0x50); tqui: 0; gapFactor: 20(0x14); retryLimit: 1
//    tid2: 360(0x168); trdy: 80(0x50); tid1: 195(0xc3); useNetworkConfig: 2 master, 7 slaves
out 01 03 02 2f 00 90 01 c3 00 68 01 50 00 00 14 02 00 1f 01 01 01 03 81 02 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35


// mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31; onlyMasterInBus: false
//  tslot: 400(0x190); maxTsdr: 360(0x168); minTsdr: 81(0x51); tset: 80(0x50); tqui: 0; gapFactor: 20(0x14); retryLimit: 1
//    tid2: 360(0x168); trdy: 80(0x50); tid1: 195(0xc3); useNetworkConfig: 12 master, 13 slaves
out 01 03 02 cc 00 90 01 c3 00 68 01 50 00 00 14 02 00 1f 01 01 01 03 81 02 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 1.5M; maxMpiAddr: 126(0X7e); onlyMasterInBus: false
//  tslot: 3000(0xbb8); maxTsdr: 980(0x3d4); minTsdr: 151(0x97); tset: 240(0xf0); tqui: 0; gapFactor: 50(0x32); retryLimit: 1
//    tid2: 980(0x3d4); trdy: 151(0x96); tid1: 515(0x203); useNetworkConfig: 20 master, 75 slaves
out 01 03 02 ec 03 b8 0b 03 02 d4 03 96 00 00 32 04 00 7e 01 01 01 03 81 02 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 45 3d 30 33 31 33

// mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31(0x1f); onlyMasterInBus: false
//  tslot: 400(0x190); maxTsdr: 360(0x168); minTsdr: 81(0x51); tset: 80(0x50); tqui: 1; gapFactor: 20(0x14); retryLimit: 2
//    tid2: 360(0x168); trdy: 80(0x50); tid1: 196(0xc4)
out 01 03 02 4e 00 90 01 c4 00 68 01 50 00 01 14 02 00 1f 02 01 01 03 81 03 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31(0x1f); onlyMasterInBus: false
//  tslot: 400(0x190); maxTsdr: 360(0x168); minTsdr: 81(0x51); tset: 80(0x50); tqui: 0; gapFactor: 20(0x14); retryLimit: 2
//    tid2: 360(0x168); trdy: 80(0x50); tid1: 195(0xc3); ttr: 19968 (default?)
out 01 03 02 4e 00 90 01 c3 00 68 01 50 00 00 14 02 00 1f 02 01 01 03 81 03 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35

// mode: PROFIBUS ; selfBusAddr: 0; timeout: 30s; busSpeed: 187.5K; maxMpiAddr: 31(0x1f); onlyMasterInBus: false
//  tslot: 400(0x190); maxTsdr: 360(0x168); minTsdr: 81(0x51); tset: 80(0x50); tqui: 0; gapFactor: 20(0x14); retryLimit: 2
//    tid2: 360(0x168); trdy: 80(0x50); tid1: 195(0xc3); ttr: 2048 (5.5ms)
out 01 03 02 04 00 90 01 c3 00 68 01 50 00 00 14 02 00 1f 02 01 01 03 81 03 00 01 00 0c 00 14 00 3c 00 00 00
in  01 03 20 56 30 30 2e 38 35
