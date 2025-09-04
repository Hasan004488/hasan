## New Installation of EITIx (Git):
- Change to EITIx directory (cd EITIx–Dashboard/)
- Stop EITIx Server:
- - bash “Stop EITIx.sh”
- Delete all EITIx services
- - npm run delete
- Copy your license key and config file
- - cp license.eitix ../license.eitix
- - cp config.eitix ../config.eitix
- Change to Parent directory (cd ..)
- Delete or backup EITIx directory
- - mv EITIx--Dashboard EITIx--Dashboard-backup
- - rm -r EITIx--Dashboard (do either one of them)
- Install new version from github (requires permission) 
- - git clone --branch "EITIx-beta-1.9.2" --single-branch "https://github.com/RIR360/EITIx--Dashboard.git"
- Bring your copied license key and config file
- - cp ../license.eitix license.eitix 
- - cp ../config.eitix config.eitix
- Change to EITIx directory (cd EITIx–Dashboard/)
- Install all EITIx dependencies:
- - bash “Install EITIx.sh”
- Run EITIx Server:
- - bash “Run EITIx.sh”


## Extras:
### Basic Mongod Service Commands:
- sudo systemctl status mongod
- sudo systemctl stop mongod
- sudo systemctl restart mongod
- sudo systemctl start mongod

## Patches:
### Remove duplicates from collection:
- node libraries/patch/rm-dup-patch users email
- node libraries/patch/rm-dup-patch roles name
- node libraries/patch/rm-dup-patch world.map.ip ip
- node libraries/patch/rm-dup-patch templates title
- node libraries/patch/rm-dup-patch wazuh.logs id
- node libraries/patch/rm-dup-patch world.map.ip ip
- node libraries/patch/rm-dup-patch fim.changes file
- node libraries/patch/rm-dup-patch vulnerabilities.cve id
- node libraries/patch/rm-dup-patch fim.changes file
"# hasan" 
