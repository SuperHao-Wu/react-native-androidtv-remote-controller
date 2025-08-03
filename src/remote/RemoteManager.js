import { RemoteMessageManager } from "./RemoteMessageManager.js";
import EventEmitter from "events";
import {Buffer} from "buffer";
import TcpSockets from 'react-native-tcp-socket';


class RemoteManager extends EventEmitter {
    constructor(host, port, certs, systeminfo) {
        super();
        this.host = host;
        this.port = port;
        this.certs = certs;
        this.chunks = Buffer.from([]);
        this.error = null;
        this.remoteMessageManager = new RemoteMessageManager(systeminfo);
        this.isManualStop = false;
    }

    async start() {
        return new Promise((resolve, reject) => {

            let options = {
                port: this.port,
                host : this.host,
                key: this.certs.key,
                cert: this.certs.cert,
                rejectUnauthorized: false,
                // Specific to react-native-tcp-socket (patched)
                androidKeyStore: this.certs.androidKeyStore,
                certAlias: this.certs.certAlias,
                keyAlias: this.certs.keyAlias,
                //ca: require('../../../../client-selfsigned.crt'),
            };
            
            console.log("Start Remote Connect");
            this.isManualStop = false;
            
            //console.log('RemoteManager.start(): before connectTLS');
            this.client = TcpSockets.connectTLS(options, () => {
                console.log("Remote connected")
            });

            this.client.on('timeout', () => {
                console.log('timeout');
                this.client.destroy();
            });

            // Le ping est reçu toutes les 5 secondes
            this.client.setTimeout(10000);

            this.client.on("secureConnect", () => {
                console.log(this.host + " Remote secureConnect");
                resolve(true);
            });

            this.client.on('data', (data) => {
                let buffer = Buffer.from(data);
                this.chunks = Buffer.concat([this.chunks, buffer]);

                if(this.chunks.length > 0 && this.chunks.readInt8(0) === this.chunks.length - 1){

                    let message = this.remoteMessageManager.parse(this.chunks);

                    if(!message.remotePingRequest){
                        //console.log(this.host + " Receive : " + Array.from(this.chunks));
                        console.log(this.host + " Receive : " + JSON.stringify(message.toJSON()));
                    }

                    if(message.remoteConfigure){
                        this.client.write(this.remoteMessageManager.createRemoteConfigure(
                            622,
                            "Build.MODEL",
                            "Build.MANUFACTURER",
                            1,
                            "Build.VERSION.RELEASE",
                            ));
                        this.emit('ready');
                    }
                    else if(message.remoteSetActive){
                        this.client.write(this.remoteMessageManager.createRemoteSetActive(622));
                    }
                    else if(message.remotePingRequest){
                        this.client.write(this.remoteMessageManager.createRemotePingResponse(message.remotePingRequest.val1));
                    }
                    else if(message.remoteImeKeyInject){
                        this.emit('current_app', message.remoteImeKeyInject.appInfo.appPackage);
                    }
                    else if(message.remoteImeBatchEdit){
                        console.log("Receive IME BATCH EDIT" + message.remoteImeBatchEdit);
                    }
                    else if(message.remoteImeShowRequest){
                        console.log("Receive IME SHOW REQUEST" + message.remoteImeShowRequest);
                    }
                    else if(message.remoteVoiceBegin){
                        //console.log("Receive VOICE BEGIN" + message.remoteVoiceBegin);
                    }
                    else if(message.remoteVoicePayload){
                        //console.log("Receive VOICE PAYLOAD" + message.remoteVoicePayload);
                    }
                    else if(message.remoteVoiceEnd){
                        //console.log("Receive VOICE END" + message.remoteVoiceEnd);
                    }
                    else if(message.remoteStart){
                        this.emit('powered', message.remoteStart.started);
                    }
                    else if(message.remoteSetVolumeLevel){
                        this.emit('volume', {
                            level : message.remoteSetVolumeLevel.volumeLevel,
                            maximum : message.remoteSetVolumeLevel.volumeMax,
                            muted : message.remoteSetVolumeLevel.volumeMuted,
                        });
                        //console.log("Receive SET VOLUME LEVEL" + message.remoteSetVolumeLevel.toJSON().toString());
                    }
                    else if(message.remoteSetPreferredAudioDevice){
                        //console.log("Receive SET PREFERRED AUDIO DEVICE" + message.remoteSetPreferredAudioDevice);
                    }
                    else if(message.remoteError){
                        console.log("Receive REMOTE ERROR");
                        this.emit('error', {error : message.remoteError});
                    }
                    else{
                        console.log("What else ?");
                    }
                    this.chunks = Buffer.from([]);
                }
            });

            this.client.on('close', async (hasError) => {
                console.info(this.host + " Remote Connection closed ", hasError);
                
                // Don't restart if it was manually stopped
                if (this.isManualStop) {
                    console.log('RemoteManager.close() after manual stop - not restarting');
                    this.isManualStop = false; // Reset flag for future connections
                    return;
                }

                if(hasError){
                    console.log('RemoteManager.close() hasError');
                    reject(this.error.code);
                    if(this.error.code === "ECONNRESET"){
                        console.log('RemoteManager.close() hasError ECONNRESET');
                        this.emit('unpaired');
                    }
                    else if(this.error.code === "ECONNREFUSED"){
                        console.log('RemoteManager.close() hasError ECONNREFUSED');
                        // L'appareil n'est pas encore prêt : on relance
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await this.start().catch((error) => {
                            console.error(error);
                        });
                    }
                    else if(this.error.code === "EHOSTDOWN"){
                        // L'appareil est down, on ne fait rien
                        console.log('RemoteManager.close() hasError EHOSTDOWN');
                    }
                    else{
                        // Dans le doute on redémarre
                        console.log('RemoteManager.close() unknown error => start again');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await this.start().catch((error) => {
                            console.error(error);
                        });
                    }
                }
                else {
                    // Si pas d'erreur on relance. Si elle s'est éteinte alors une erreur empéchera de relancer encore
                    console.log('RemoteManager.close() no error => start again');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await this.start().catch((error) => {
                        console.error(error);
                    });
                }
            });

            this.client.on('error', (error) => {
                console.error(this.host, error);
                this.error = error;
            });
        });

    }

    sendPower(){
        this.client.write(this.remoteMessageManager.createRemoteKeyInject(
            this.remoteMessageManager.RemoteDirection.SHORT,
            this.remoteMessageManager.RemoteKeyCode.KEYCODE_POWER));
    }

    sendKey(key, direction){
        this.client.write(this.remoteMessageManager.createRemoteKeyInject(
            direction,
            key));
    }

    sendAppLink(app_link){
        this.client.write(this.remoteMessageManager.createRemoteRemoteAppLinkLaunchRequest(app_link));
    }

    stop(){
        console.log(`${this.host} RemoteManager.stop(): Cleaning up connection`);
        
        this.isManualStop = true;
        
        // Close and clean up TCP client socket
        if (this.client) {
            try {
                // Remove all event listeners to prevent memory leaks
                this.client.removeAllListeners();
                
                // Destroy the socket connection
                this.client.destroy();
                this.client = null;
            } catch (error) {
                console.log(`${this.host} RemoteManager.stop(): Error during cleanup:`, error);
            }
        }
        
        // Reset chunks buffer and error state
        this.chunks = Buffer.from([]);
        this.error = null;
        
        console.log(`${this.host} RemoteManager.stop(): Cleanup completed`);
    }
}

export { RemoteManager };
