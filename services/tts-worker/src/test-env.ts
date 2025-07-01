import { lookup } from 'dns';
import { promisify } from 'util';

const lookupPromise = promisify(lookup);

const hostname = 'amencast-wuciuykc.livekit.cloud';

async function checkEnvironment() {
    console.log('--- Node.js Environment Check ---');
    
    // 1. Check Node.js Version
    console.log(`Node.js Version: ${process.version}`);
    console.log('---------------------------------');

    // 2. Test DNS Resolution
    console.log(`Attempting to resolve DNS for: ${hostname}`);
    try {
        const { address, family } = await lookupPromise(hostname);
        console.log('✅ SUCCESS: DNS resolution successful.');
        console.log(`   IP Address: ${address}`);
        console.log(`   Family: IPv${family}`);
    } catch (error) {
        console.error('❌ FAILED: DNS resolution failed.');
        console.error('This means your Node.js environment cannot find the LiveKit server on the network.');
        console.error(error);
    }
    console.log('---------------------------------');
}

checkEnvironment(); 