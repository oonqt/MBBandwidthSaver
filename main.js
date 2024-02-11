const { qBittorrentClient } = require('@robertklep/qbittorrent');
const ip = require('ip');
const { WebSocket } = require('ws');

console.log('Starting application...');

let seedBlock = false;

const client = new qBittorrentClient(process.env.QBIT_HOST, process.env.QBIT_USER, process.env.QBIT_PASSWORD);

const main = async () => {
    const wsc = new WebSocket(`${process.env.EMBY_HOST}/embywebsocket?api_key=${process.env.EMBY_API_KEY}`);

    wsc.on('open', () => {
        console.log('Connected to Emby websocket');

        wsc.send(JSON.stringify({MessageType: "SessionsStart", Data: "0,500"}));

    });

    wsc.on('message', async (data) => {
        const { Data } = JSON.parse(data);

        hasRemoteSession = false;

        for (const session of Data) {
            if(session.NowPlayingItem && !ip.cidrSubnet(process.env.LOCAL_SUBNET).contains(session.RemoteEndPoint) && !ip.isLoopback(session.RemoteEndPoint)) hasRemoteSession = true;
        }

        if (hasRemoteSession && !seedBlock) {
            console.log('Remote session detected, enabling seedblock');

            await client.transfer.setUploadLimit(1).then(() => seedBlock = true).catch(console.error);

            seedBlock = true;
        } else if (!hasRemoteSession && seedBlock) {
            console.log('All remote sessions closed, disabling seedblock');

            await client.transfer.setUploadLimit(0).then(() => seedBlock = false).catch(console.error);
        }
    });

    wsc.on('close', () => {
        console.log('Websocket connection interrupted. Closing current socket. Will attempt to reconnect in a few seconds');

        wsc.close();

        setTimeout(() => {
            main();
        }, 5000);
    });

    wsc.on('error', (error) => {
        console.log(`Websocket error: ${error.code}`);
    });
}

main();