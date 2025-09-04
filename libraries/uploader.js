const fs = require("fs");
const multer = require('multer');

const ATTACH_FILTERS = [".doc", ".docx", ".odt", ".txt", ".json", ".jpg", ".jpeg", ".png", ".xls", ".xlsx", ".ods", ".ppt", ".pptx"];
const IMG_FILTERS = [".jpg", ".jpeg", ".png", ".gif"];
const ATTACH_LIMIT = 1024 * 1024 * 10;
const ASSET_LIMIT = 1024 * 1024 * 5;

const UPLOADER = {

    organization: multer({

        storage: multer.diskStorage({

            destination: function (req, file, cb) {

                cb(null, './public/images/');

            },

            filename: function (req, file, cb) {

                cb(null, "organization.png");

            }

        }),

        limits: {
            
            fileSize: ASSET_LIMIT

        },

        fileFilter: (req, file, cb) => {

            let extension = '.' + file.originalname.split('.').pop().toLowerCase();
            let valid_extension = IMG_FILTERS.includes(extension);
            let valid_mime = file.mimetype.startsWith("image/");
            
            if (valid_extension && valid_mime) {

              cb(null, true); // Accept the file

            } else {

              cb({name: "Multer", message: "File extension or mime is not valid!"}, false);

            }
        }
 
    }),

    profile: multer({

        storage: multer.diskStorage({

            destination: function (req, file, cb) {

                if (!fs.existsSync('./assets/images')) {
                    fs.mkdirSync('./assets/images');
                }

                cb(null, './assets/images');

            },

            filename: function (req, file, cb) {

                const randomText = Math.random().toString(36).substring(2, 15);
                cb(null, `${req.body?.full_name || randomText} profile.${file.originalname.split('.').pop()}`);

            }

        }),

        limits: {

            fileSize: ASSET_LIMIT

        },

        fileFilter: (req, file, cb) => {

            let extension = '.' + file.originalname.split('.').pop().toLowerCase();
            let valid_extension = IMG_FILTERS.includes(extension);
        
            if (valid_extension) {
                
                cb(null, true);

            } else {

                cb({name: "Multer", message: "File extension or mime is not valid!"}, false);

            }
        },
 
    }),

    attachments: multer({

        storage: multer.diskStorage({

            destination: function (req, file, cb) {

                if (!fs.existsSync('./assets/attachments/')) {
                    fs.mkdirSync('./assets/attachments/');
                }

                cb(null, './assets/attachments/');

            },

            filename: function (req, file, cb) {

                const dt = new Date().toISOString().replace(/[.:T-]/g, '').replace(/[^A-Za-z0-9]/g, '_');
                const id = Math.random().toString(36).substring(0, 10);
                cb(null, `${dt}_${id}`);

            }

        }),

        limits: {

            fileSize: ATTACH_LIMIT // 10MB file size limit

        },

        fileFilter: (req, file, cb) => {

            let extension = '.' + file.originalname.split('.').pop().toLowerCase();
            let valid_extension = ATTACH_FILTERS.includes(extension);
        
            if (valid_extension) {
                
                cb(null, true); // Accept the file

            } else {

                cb({name: "Multer", message: "File extension or mime is not valid!"}, false);

            }
        },
 
    }),

    backup: multer({

        storage: multer.diskStorage({

            destination: function (req, file, cb) {

                if (!fs.existsSync('./backups/')) {
                    fs.mkdirSync('./backups/');
                }

                cb(null, './backups/');

            },

            filename: function (req, file, cb) {

                const dt = new Date().toISOString().replace(/[.:T-]/g, '').replace(/[^A-Za-z0-9]/g, '_');
                const id = Math.random().toString(36).substring(0, 10);
                cb(null, `ex-point-${dt}_${id}.tar.gz`);

            }

        }),

        limits: {

            fileSize: 1024 * 1024 * 500 // 500MB file size limit

        },

        /* fileFilter: (req, file, cb) => {

            let extension = '.' + file.originalname.split('.').pop().toLowerCase();
            let valid_extension = ['.tar.gz'].includes(extension);
            let valid_mime = file.mimetype === 'application/gzip';
        
            if (valid_extension && valid_mime) {
                
                cb(null, true); // Accept the file

            } else {

                cb({name: "Multer", message: "File extension or mime is not valid!"}, false);

            }
        }, */

    }),

}

module.exports = {

    UPLOADER

}