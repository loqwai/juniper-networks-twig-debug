
import WiFi from "wifi";
import { Request } from "http";
import OTA from "ota";

import { ssid, password } from './wifi-credentials'
trace('\n\n\n\n BEGIN \n');

const main = async () => {
  trace('main\n');
  await connectToNetwork({ ssid, password });
  trace('connected\n');
  await downloadOTAFirmware();
  trace('downloaded\n');
}

const connectToNetwork = ({ ssid, password }) => {
  let times = 0;
  return new Promise((resolve, reject) => {
    const monitor = new WiFi({ ssid, password }, function (msg, code) {
      trace(`callback: msg ${msg} code ${code}, times: ${++times}\n`);
      switch (msg) {
        case "gotIP":
          trace('gotIP\n');
          times = 0
          monitor.close();
          resolve(monitor);

        case "connect":
          trace(`Wi-Fi connected to "${ssid}"\n`);
          return

        case "disconnect":
          trace((-1 === code) ? "Wi-Fi password rejected\n" : "Wi-Fi disconnected\n");
          if (times > 10) {
            reject(new Error(`too many attempts`));
            return;
          }
          WiFi.connect({ ssid, password });
          return
        default:
          reject(new Error(`unknown message: ${msg}`));
      }
    });
  })
}

const downloadOTAFirmware = async () => {
  trace('downloadOTAFirmware\n');
  let ota = null;
  let byteLength = -1;
  let received = 0;

  return new Promise((resolve, reject) => {
    const request = new Request({ host: "192.168.1.103", port: 8080, path: "/bin/ota1.bin" });
    request.callback = function (message, value, etc) {
      trace(`request: msg ${message} value ${value} etc ${etc}\n`);
      switch (message) {
        case Request.status:
          if (200 !== value)
            return reject(Error("unexpected http status"))
          break;

        case Request.header:
          if ("content-length" === value) {
            try {
              byteLength = parseInt(etc);
              trace(`about to OTA: byteLength: ${byteLength}\n`);
              ota = new OTA({ byteLength });
              received = 0;
            }
            catch (e) {
              return reject(new Error("unable to start OTA: " + e));
            }
            trace(`OTA object initialization complete\n`);
          }
          break;

        case Request.responseFragment: {
          const bytes = request.read(ArrayBuffer);
          received += bytes.byteLength;
          trace(`received ${received} of ${byteLength}\n`);
          trace(`attempting to write ${bytes.byteLength} bytes\n`);
          ota.write(bytes);
        } break;

        case Request.responseComplete:
          ota.complete();
          trace("ota complete\n");
          return resolve();
          break;

        default:
          if (message < 0) {
            ota?.cancel();
            return reject(new Error("http error"));
          }
          break;
      }
    }
  })
}


main().catch(err => {
  trace(`error: ${err.message}\n`);
  throw err
});
