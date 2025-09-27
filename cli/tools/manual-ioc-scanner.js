const iocProcessor = require("../../workers/tools/ioc-processor");
const { closeConnection } = require('../../libraries/database');
const logger = require('../../libraries/logger');

const command = process.argv[2] ? process.argv[2].toLowerCase() : null;

async function run() {
    if (!command || command === 'help') {
        showHelp();
        process.exit(0);
    }

    // Call sysLog as a method of the logger object
    logger.sysLog(`Manual Runner: Executing command: '${command}'`);

    const isLongRunningProcess = (command === 'import-misp');

    try {
        switch (command) {
            case 'process':
                console.log("\nStarting full IOC processing...");
                await iocProcessor.processAllSources({ scanMisp: false });
                await iocProcessor.ensureIndexes();
                await iocProcessor.importMispData();
                console.log("\nFull IOC processing & MISP import finished.");
                break;

            case 'import-misp':
                console.log("\nStarting MISP continuous sync worker...");
                await iocProcessor.importMispData(); 
                console.log("MISP worker is now running in continuous monitoring mode.");
                break;
            
            case 'scan-misp':
                console.log("\nStarting scan of local IOCs against MISP database...");
                await iocProcessor.scanIndicatorsAgainstMisp();
                console.log("\nMISP scan finished.");
                break;

            case 'ensure-indexes':
                console.log("\nEnsuring all database indexes are created...");
                await iocProcessor.ensureIndexes();
                console.log("\nIndex verification complete.");
                break;

            case 'clear-cache':
                console.log("\nClearing local threat feed cache...");
                await iocProcessor.clearCache();
                console.log("\nCache cleared successfully.");
                break;

            default:
                console.log(`\nError: Unknown command '${command}'.`);
                showHelp();
                break;
        }
    } catch (error) {
        // To log an error, call sysLog with the error object as the second argument
        logger.sysLog(`Manual Runner: An unexpected error occurred: ${error.message}`, error);
    } finally {
        if (!isLongRunningProcess) {
            await closeConnection();
            // Call sysLog as a method of the logger object
            logger.sysLog("Manual Runner: Database connection closed. Script finished.");
            process.exit(0);
        }
    }
}

function showHelp() {
    console.log(`
  Manual IOC Scanner & Processor
  ---------------------------------
  Usage:
    node cli/tools/manual-ioc-scanner.js <command>

  Available Commands:
    process          - Fetches indicators, stores them, and runs the MISP import.
    import-misp      - Starts the continuous MISP sync worker (runs forever).
    scan-misp        - Scans local indicators against the MISP database.
    ensure-indexes   - Verifies and creates necessary database indexes.
    clear-cache      - Deletes all cached threat intelligence files.
    help             - Displays this help message.
  `);
}

run();