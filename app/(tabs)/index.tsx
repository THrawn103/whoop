import PeripheralList from "@/components/PeripheralList";
import { handleAndroidPermissions } from "@/utils/permission";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
} from "react-native";
import BleManager, {
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent,
  BleScanCallbackType,
  BleScanMatchMode,
  BleScanMode,
  Peripheral,
} from "react-native-ble-manager";
declare module "react-native-ble-manager" {
  interface Peripheral {
    connected?: boolean;
    connecting?: boolean;
  }
}

type WriteArgs = {
  data: number[];
  peripheralId: string;
  serviceId: string;
  receive: string;
  transfer: string;
};

type ReadArgs = { peripheral: string; service: string; receive: string };

export type PeripheralServices = {
  peripheralId: string;
  serviceId: string;
  transfer: string;
  receive: string;
};

const SECONDS_TO_SCAN_FOR = 5;
const SERVICE_UUIDS: string[] = [];
const ALLOW_DUPLICATES = true;

const DEVICE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const TRANSFER_CHARACTERISTIC_UUID = "beb5483f-36e1-4688-b7f5-ea07361b26a9";
const RECEIVE_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

const BluetoothDemoScreen: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [peripherals, setPeripherals] = useState(
    new Map<Peripheral["id"], Peripheral>()
  );
  const [isConnected, setIsConnected] = useState(false);
  const [characteristics, setCharacteristics] = useState<
    PeripheralServices | undefined
  >(undefined);

  useEffect(() => {
    try {
      BleManager.start({ showAlert: false })
        .then(() => console.debug("BleManager started."))
        .catch((error: any) =>
          console.error("BeManager could not be started.", error)
        );
    } catch (error) {
      console.error("unexpected error starting BleManager.", error);
      return;
    }

    const listeners: any[] = [
      BleManager.onDiscoverPeripheral(handleDiscoverPeripheral),
      BleManager.onStopScan(handleStopScan),
      BleManager.onConnectPeripheral(handleConnectPeripheral),
      BleManager.onDidUpdateValueForCharacteristic(
        handleUpdateValueForCharacteristic
      ),
      BleManager.onDisconnectPeripheral(handleDisconnectedPeripheral),
    ];

    handleAndroidPermissions();

    return () => {
      for (const listener of listeners) {
        listener.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnectedPeripheral = (
    event: BleDisconnectPeripheralEvent
  ) => {
    console.debug(
      `[handleDisconnectedPeripheral][${event.peripheral}] disconnected.`
    );
    setPeripherals((map) => {
      let p = map.get(event.peripheral);
      if (p) {
        p.connected = false;
        return new Map(map.set(event.peripheral, p));
      }
      return map;
    });
  };

  const handleConnectPeripheral = (event: any) => {
    console.log(`[handleConnectPeripheral][${event.peripheral}] connected.`);
  };

  const handleUpdateValueForCharacteristic = async (
    data: BleManagerDidUpdateValueForCharacteristicEvent
  ) => {
    console.debug(
      `[handleUpdateValueForCharacteristic] received data from '${data.peripheral}' with characteristic='${data.characteristic}' and value='${data.value}====='`
    );
  };

  const handleStopScan = () => {
    setIsScanning(false);
    console.debug("[handleStopScan] scan is stopped.");
  };

  const handleDiscoverPeripheral = (peripheral: Peripheral) => {
    console.debug("[handleDiscoverPeripheral] new BLE peripheral=", peripheral);
    // if (!peripheral.name) {
    //   peripheral.name = "NO NAME";
    // }
    // setPeripherals((map) => {
    //   return new Map(map.set(peripheral.id, peripheral));
    // });
  };

  const connectPeripheral = async (
    peripheral: Omit<Peripheral, "advertising">
  ) => {
    try {
      if (peripheral) {
        setPeripherals((map) => {
          let p = map.get(peripheral.id);
          if (p) {
            p.connecting = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        await BleManager.connect(peripheral.id);
        console.debug(`[connectPeripheral][${peripheral.id}] connected.`);
        setPeripherals((map) => {
          let p = map.get(peripheral.id);
          if (p) {
            p.connecting = false;
            p.connected = true;
            return new Map(map.set(p.id, p));
          }
          return map;
        });

        // before retrieving services, it is often a good idea to let bonding & connection finish properly
        await sleep(900);
        /* Test read current RSSI value, retrieve services first */
        const peripheralData = await BleManager.retrieveServices(peripheral.id);
        console.log(
          peripheralData.characteristics,
          "peripheralData.characteristics======="
        );
        if (peripheralData.characteristics) {
          const peripheralParameters = {
            peripheralId: peripheral.id,
            serviceId: DEVICE_SERVICE_UUID,
            transfer: TRANSFER_CHARACTERISTIC_UUID,
            receive: RECEIVE_CHARACTERISTIC_UUID,
          };
          setCharacteristics(peripheralParameters);
          setIsConnected(true);
        }
        setPeripherals((map) => {
          let p = map.get(peripheral.id);
          if (p) {
            return new Map(map.set(p.id, p));
          }
          return map;
        });
        const rssi = await BleManager.readRSSI(peripheral.id);
        if (peripheralData.characteristics) {
          for (const characteristic of peripheralData.characteristics) {
            if (characteristic.descriptors) {
              for (const descriptor of characteristic.descriptors) {
                try {
                  let data = await BleManager.readDescriptor(
                    peripheral.id,
                    characteristic.service,
                    characteristic.characteristic,
                    descriptor.uuid
                  );
                } catch (error) {
                  console.error(
                    `[connectPeripheral][${peripheral.id}] failed to retrieve descriptor ${descriptor} for characteristic ${characteristic}:`,
                    error
                  );
                }
              }
            }
          }
        }
        setPeripherals((map) => {
          let p = map.get(peripheral.id);
          if (p) {
            p.rssi = rssi;
            return new Map(map.set(p.id, p));
          }
          return map;
        });
      }
    } catch (error) {
      console.error(
        `[connectPeripheral][${peripheral.id}] connectPeripheral error`,
        error
      );
    }
  };

  const disconnectPeripheral = async (peripheralId: string) => {
    try {
      await BleManager.disconnect(peripheralId);
      setCharacteristics(undefined);
      setPeripherals(new Map());
      setIsConnected(false);
    } catch (error) {
      console.error(
        `[disconnectPeripheral][${peripheralId}] disconnectPeripheral error`,
        error
      );
    }
  };

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  const enableBluetooth = async () => {
    try {
      console.debug("[enableBluetooth]");
      await BleManager.enableBluetooth();
    } catch (error) {
      console.error("[enableBluetooth] thrown", error);
    }
  };

  const startScan = async () => {
    const state = await BleManager.checkState();

    console.log(state);
    

    if (state === "off") {
      if (Platform.OS == "ios") {
        Alert.alert(
          "Enable Bluetooth",
          "Please enable Bluetooth in Settings to continue.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                Linking.openURL("App-Prefs:Bluetooth");
              },
            },
          ]
        );
      } else {
        enableBluetooth();
      }
    }
    if (!isScanning) {
      setPeripherals(new Map<Peripheral["id"], Peripheral>());
      try {
        console.debug("[startScan] starting scan...");
        setIsScanning(true);
        BleManager.scan(SERVICE_UUIDS, SECONDS_TO_SCAN_FOR, ALLOW_DUPLICATES, {
          matchMode: BleScanMatchMode.Sticky,
          scanMode: BleScanMode.LowLatency,
          callbackType: BleScanCallbackType.AllMatches,
        })
          .then(() => {
            console.debug("[startScan] scan promise returned successfully.");
          })
          .catch((err: any) => {
            console.error("[startScan] ble scan returned in error", err);
          });
      } catch (error) {
        console.error("[startScan] ble scan error thrown", error);
      }
    }
  };

  const write = async (args: WriteArgs) => {
    const MTU = 255;
    if (characteristics) {
      await BleManager.startNotification(
        args.peripheralId,
        args.serviceId,
        args.receive
      );
      await sleep(900);
      await BleManager.write(
        args.peripheralId,
        args.serviceId,
        args.transfer,
        args.data,
        MTU
      );
    }
  };
  

  const read = async (args: ReadArgs) => {
    const response = await BleManager.read(
      args.service,
      args.peripheral,
      args.receive
    );
    return response;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Bluetooth Demo</Text>
      <TouchableOpacity style={styles.scanButton} onPress={startScan}>
        <Text style={styles.scanButtonText}>
          {isScanning ? "Scanning..." : "Start Scan"}
        </Text>
      </TouchableOpacity>
      {Array.from(peripherals.values()).length > 0 ? (
        <PeripheralList
          onConnect={connectPeripheral}
          peripherals={Array.from(peripherals.values())}
        />
      ) : (
        <Text style={styles.emptyText}>No peripherals found</Text>
      )}
      {isConnected && characteristics && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={() => {
              read({
                peripheral: characteristics.peripheralId,
                receive: characteristics.receive,
                service: characteristics.serviceId,
              });
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>READ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              write({
                data: [1, 2, 3, 4, 5, 6],
                receive: characteristics.receive,
                serviceId: characteristics.serviceId,
                transfer: characteristics.transfer,
                peripheralId: characteristics.peripheralId,
              });
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>WRITE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => disconnectPeripheral(characteristics?.peripheralId)}
            style={styles.disconnectButton}
          >
            <Text style={styles.buttonText}>DISCONNECT</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingVertical: "10%",
    paddingHorizontal: 20,
    // alignItems: 'center',
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#333",
  },
  scanButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "500",
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    marginTop: 20,
  },
  actionButtons: {
    flexDirection: "row",
    marginTop: 16,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 8,
    flexGrow: 1,
  },
  disconnectButton: {
    backgroundColor: "red",
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "500",
  },
});

export default BluetoothDemoScreen;
