/* 
Attention!
Can't use globals library here 
*/

const fs = require("fs");
const { sysLog } = require("./logger");
const { encrypt, decrypt } = require("./encrypter");

const CONFIG_FILE = "./config.eitix";
let configuration = {};

try {

  let config_buffer;

  if (fs.existsSync(CONFIG_FILE)) {
    config_buffer = fs.readFileSync(CONFIG_FILE);
  }

  if (config_buffer && config_buffer.length > 2) {

    let decrypted_config = decrypt(config_buffer);
    configuration = JSON.parse(decrypted_config);

  }

} catch (err) {

  sysLog("Failed to read/parse config.eitix file", err);

}

// get the latest configuration file
function getConfig() {

  try {

      let config_buffer;
  
      if (fs.existsSync(CONFIG_FILE)) {
        config_buffer = fs.readFileSync(CONFIG_FILE);
      }

      if (config_buffer && config_buffer.length > 2) {

          let decrypted_config = decrypt(config_buffer);
          return JSON.parse(decrypted_config);

      } else return {};

  } catch (err) {

    // sysLog("Failed to read/parse config.eitix file", err);
    console.log("Failed to read/parse config.eitix file", err);
    return {};

  }

}

// update confirguration file
function updateConfig(new_configuration, error) {

  try {

    let new_config = JSON.stringify(new_configuration, null, 2);
    let encrypted_config = encrypt(Buffer.from(new_config));

    fs.writeFileSync(CONFIG_FILE, encrypted_config);

    if (typeof error === "function") {
      // only if callback is needed
      error();
    }


  } catch (err) {

    sysLog("Failed to write/update config.eitix file", err);

    if (typeof error === "function") {
      // only if callback is needed
      error(err.message);
    }

  }
}

function resetConfig(error) {

  let reset = getConfig() || {};

  reset.admin_created = false;
  reset.eitix_configured = false;
  reset.configure_failed = false;

  updateConfig(reset, err => {

    if (err) error(err);
    else error();

  })

}

module.exports = {

  getConfig,
  resetConfig,
  updateConfig

}