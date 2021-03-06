const fs = require('fs'),
      readline = require('readline'),
      urllib = require('urllib'),
      promisify = require('util').promisify,
      writeFile = promisify(require('fs').writeFile),
      readFile = promisify(require('fs').readFile);

const client = new urllib.HttpClient2();
const GoogleSupportedDevices = 'http://storage.googleapis.com/play_public/supported_devices.csv';
const outASCII = new RegExp('\\\\x[0-9a-f][0-9a-f]|\\t|\\\\t|\\\'|\\\\\'|\\\\|\\\"', 'g');

const metaKeys = [];
const devices = [];

async function dl2file(url, local) {
  await client.request(url, {
    writeStream: fs.createWriteStream(local),
    timeout: 30000,
  });
}

function splitNumAlphaAndClean(keyArray) {
  const retArray = [];
  for (key_index in keyArray) {
    const key = keyArray[key_index].replace(outASCII, '');
    if (key === '')
      continue;
    let alphaFlag = false;
    let numFlag = false;
    let pushedFlag = false;
    for (char_index in key) {
      const char = key[char_index];
      if ('z' >= char && char >= 'A') {
        alphaFlag = true;
        if (numFlag) {
          retArray.push(key.substring(0, char_index));
          retArray.push(key.substring(char_index));
          pushedFlag = true;
          break;
        }
      }
      else if ('9' >= char && char >= '0') {
        numFlag = true;
        if (alphaFlag) {
          retArray.push(key.substring(0, char_index));
          retArray.push(key.substring(char_index));
          pushedFlag = true;
          break;
        }
      }
    }
    if (!pushedFlag)
      retArray.push(key);
  }
  return keyArray;
}

async function genKeywords() {
  brands = JSON.parse(await readFile('out/metadata.json'));
  for (brand_index in brands) {
    const brand = brands[brand_index];
    for (device_index in brand.devices) {
      const device = {
        key: [],
        path: brand.devices[device_index].image.split('/').pop(),
      };
      device.key.push.apply(device.key, splitNumAlphaAndClean(brand.devices[device_index].name.split(new RegExp([' ', '-'].join('|'), 'g'))));
      device.key.push.apply(device.key, splitNumAlphaAndClean(brand.devices[device_index].path.split('-')[0].split('_')));
      for (key_index in device.key) {
        device.key[key_index] = device.key[key_index].toLowerCase();
      }
      metaKeys.push(device);
    }
  }
  await writeFile('out/metakeys.json', JSON.stringify(metaKeys, null, '\t'));
}

async function genMapping() {
  const splitKeys = new RegExp([' ', '-', '_'].join('|'), 'g');
  const rl = readline.createInterface({
    input: fs.createReadStream('out/supported_devices.csv', {
      encoding: 'utf16le',
    }),
    crlfDelay: Infinity,
  });
  rl.on('line', (line) => {
    if (line === '') {
      return;
    }
    const device = {};
    lineArray = line.split(',');
    device.brand = lineArray[0].replace(outASCII, '');
    device.marketingName = lineArray[1].replace(outASCII, '');
    device.device = lineArray[2].replace(outASCII, '');
    device.model = lineArray[3].replace(outASCII, '');
    csvKeys = [];

    if (device.brand != '') {
      csvKeys.push.apply(csvKeys, splitNumAlphaAndClean(device.brand.split(splitKeys)));
    }
    if (device.marketingName != '') {
      csvKeys.push.apply(csvKeys, splitNumAlphaAndClean(device.marketingName.split(splitKeys)));
    }
    if (device.device != '') {
      csvKeys.push.apply(csvKeys, splitNumAlphaAndClean(device.device.split(splitKeys)));
    }
    if (device.model != '') {
      csvKeys.push.apply(csvKeys, splitNumAlphaAndClean(device.model.split(splitKeys)));
    }
    for (key_index in csvKeys) {
      csvKeys[key_index] = csvKeys[key_index].toLowerCase();
    }
    let maxPoint = 0;
    let maxPath = 'default.png';
    for (metaKeyIndex in metaKeys) {
      const metakeys = metaKeys[metaKeyIndex].key;
      let hitkey = 0;
      for (csvKeysIndex in csvKeys) {
        for (metakeysIndex in metakeys) {
          if (csvKeys[csvKeysIndex] == metakeys[metakeysIndex]) {
            hitkey++;
            break;
          }
        }
      }
      const point = hitkey / csvKeys.length;
      if (point > maxPoint) {
        maxPoint = point;
        maxPath = metaKeys[metaKeyIndex].path;
      }
    }
    device.path = maxPath;
    console.log(device);
    devices.push(device);
    console.log('genMapping of device : %d', devices.length);
  }).on('close', async () => {
    await writeFile('out/mapping.json', JSON.stringify(devices, null, '\t'));
    console.log('genMapping OK');
  });
}

async function main() {
  await genKeywords(); // need metadata.json
  await dl2file(GoogleSupportedDevices, 'out/supported_devices.csv');
  console.log('Download support_devices.csv OK');
  await genMapping(); // need supported_devices.csv
}

try {
  main();
} catch (e) {
  console.log(e);
}
