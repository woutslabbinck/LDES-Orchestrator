import {readdirSync, unlinkSync, rmdirSync} from 'fs';
import * as Path from 'path';

module.exports = async (): Promise<void> => {
  const rootPath = Path.join(__dirname, '..');
  const configFileName = 'config.json';
  const configPath = Path.join(rootPath, configFileName);

  const files = readdirSync(rootPath);

  if (files.includes(configFileName)) {
    unlinkSync(configPath);
  } else {
    console.log('Credentials were never there, woopsie');
  }
  // remove solid pod (note, maybe do properly)
  rmdirSync(Path.join(__dirname, 'solidPod'), {recursive: true});
  process.exit();
};
