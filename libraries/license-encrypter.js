const { encrypt } = require("./encrypter");
const fs = require("fs");

try {

  const OLD_FILE = "./tests/key.json";
  const NEW_FILE = "./tests/license.eitix";

  const data = fs.readFileSync(OLD_FILE);
  const encrypted = encrypt(data);
  fs.writeFileSync(NEW_FILE, encrypted);
  console.log("Done");
  
} catch (err) {

  console.log(err);
  
}