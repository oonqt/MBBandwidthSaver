const { qBittorrentClient } = require('@robertklep/qbittorrent');
const ip = require('ip');
const { WebSocket } = require('ws');

const log = (msg) => console.log(`${new Date().toISOString()}: ${msg}`);

const main = async () => {
    let seedBlock = false;
    const client = new qBittorrentClient(process.env.QBIT_HOST, process.env.QBIT_USER, process.env.QBIT_PASS);

    const wsc = new WebSocket(`${process.env.EMBY_HOST}/embywebsocket?api_key=${process.env.EMBY_API_KEY}`);

    wsc.on('open', () => {
        log('Connected to Emby websocket');

        wsc.send(JSON.stringify({ MessageType: "SessionsStart", Data: "0,500" }));
    });

    
    wsc.on('message', async (data) => {
        const { Data } = JSON.parse(data);

        let hasRemoteSession = false;

        for (const session of Data) {
            if (session.NowPlayingItem && !ip.cidrSubnet(process.env.LOCAL_SUBNET).contains(session.RemoteEndPoint) && !ip.isLoopback(session.RemoteEndPoint)) hasRemoteSession = true;
        }

        if (hasRemoteSession && !seedBlock) {
            log('Remote session detected, enabling seedblock');

            seedBlock = true;

            try {
                await client.transfer.setUploadLimit(1)
            } catch(err) {
                log(err);
                seedBlock = false;
            }
        } else if (!hasRemoteSession && seedBlock) {
            log('All remote sessions closed, disabling seedblock');

            try {
                await client.transfer.setUploadLimit(0);
                seedBlock = false;
            } catch (err) {
                log(err);
            }
        }
    });

    wsc.on('close', async () => {
        log('Websocket connection interrupted. Closing current socket, disabling seedblock Will attempt to reconnect in a few seconds');
        
        if (seedBlock) {
            try {
                await client.transfer.setUploadLimit(0);
                seedBlock = false;
            } catch (err) {
                log(err);
            }
        }

        wsc.close();

        setTimeout(() => {
            main();
        }, 5000);
    });

    wsc.on('error', (error) => {
        log(`Websocket error: ${error.code}`);
    });
}

log('Starting application...');

main();