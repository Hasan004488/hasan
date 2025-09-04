const crypto = require('crypto');

const password = '94adb30b98e30609be1f6ded8dcb97b59b4208';

// Encryption function
const encrypt = (data) => {
  try {

    const plainText = String(data);
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(password).digest('base64').slice(0, 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(plainText);
    encrypted = Buffer.concat([encrypted, cipher.final()])
    
    return iv.toString('hex') + ':' + encrypted.toString('hex');

  } catch (error) {

    console.error(error);

  }
}

// Decryption function
const decrypt = (data) => {
  try {

    const encryptedText = String(data);
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');

    const encryptedData = Buffer.from(textParts.join(':'), 'hex');
    const key = crypto.createHash('sha256').update(password).digest('base64').substr(0, 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    const decrypted = decipher.update(encryptedData);
    const decryptedText = Buffer.concat([decrypted, decipher.final()]);

    return decryptedText.toString();

  } catch (error) {

    console.error(error)

  }
}

module.exports = {

  encrypt,
  decrypt

}