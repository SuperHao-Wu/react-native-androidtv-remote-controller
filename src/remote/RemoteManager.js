import { RemoteMessageManager } from "./RemoteMessageManager.js";
import { TLSRequestQueue } from "../network/TLSRequestQueue.js";
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
        
        // Initialize TLS retry queue for port 6466 connections
        this.tlsQueue = new TLSRequestQueue();
        
        // Progress callback for connection attempts
        this.onProgressCallback = null;
        this.currentAbortController = null;
        
        // Heartbeat monitoring for connection health
        this.lastPingReceived = null;
        this.heartbeatInterval = null;
        this.isConnected = false;
    }

    /**
     * Set progress callback for connection attempts
     * @param {Function} callback Function to receive progress updates
     */
    setProgressCallback(callback) {
        this.onProgressCallback = callback;
    }

    async start() {
        console.log(`🖥️  RemoteManager: Starting remote connection to ${this.host}:${this.port} with TLS retry logic`);
        
        try {
            this.isManualStop = false;
            
            // Create new abort controller for this connection attempt
            this.currentAbortController = new AbortController();
            
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
            };
            
            console.log(`🔗 RemoteManager: Using TLS retry queue for ${this.host}:${this.port}`);
            
            // Use TLS retry logic for robust port 6466 connections with progress tracking
            const connection = await this.tlsQueue.createConnectionWithRetry(
                this.host, 
                this.port, 
                options,
                Infinity, // infinite retries for remote connections
                {
                    onProgress: this.onProgressCallback,
                    abortSignal: this.currentAbortController.signal
                }
            );
            
            // Extract the underlying socket from PooledTLSConnection
            this.client = connection.socket;
            
            console.log(`✅ RemoteManager: ${this.host}:${this.port} - Remote connection established with retry logic`);
            
            // Set up connection tracking
            this.isConnected = true;
            this.lastPingReceived = Date.now();
            
            // Start heartbeat monitoring
            this.startHeartbeatMonitoring();
            
            // Set up socket event handlers
            this.setupSocketHandlers();
            
            console.log(`✅ RemoteManager: ${this.host}:${this.port} - Remote ready, emitting 'ready' event`);
            this.emit('ready'); // Emit ready event to signal successful connection
            
            return true;
            
        } catch (error) {
            console.error(`❌ RemoteManager: ${this.host}:${this.port} - Connection failed after retries:`, error.message);
            this.isConnected = false;
            throw error;
        }
    }
    
    /**
     * Set up socket event handlers for the established connection
     */
    setupSocketHandlers() {
        this.client.on('timeout', () => {
            console.log(`⏰ RemoteManager: ${this.host}:${this.port} - Socket timeout`);
            this.client.destroy();
        });

        // Le ping est reçu toutes les 5 secondes
        this.client.setTimeout(10000);

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
                    // Update heartbeat tracking on ping received
                    this.lastPingReceived = Date.now();
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
            console.log(`🚪 RemoteManager: ${this.host}:${this.port} - Remote connection closed, hasError: ${hasError}`);
            
            // Update connection state and stop heartbeat monitoring
            this.isConnected = false;
            this.stopHeartbeatMonitoring();
            
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
            console.error(`❌ RemoteManager: ${this.host}:${this.port} - Connection error:`, error.code, error.message);
            this.error = error;
            this.isConnected = false;
        });
    }
    
    /**
     * Start proactive heartbeat monitoring for connection health
     */
    startHeartbeatMonitoring() {
        console.log(`💓 RemoteManager: Starting heartbeat monitoring for ${this.host}:${this.port}`);
        
        // Clear any existing interval
        this.stopHeartbeatMonitoring();
        
        this.heartbeatInterval = setInterval(() => {
            if (!this.isConnected || this.isManualStop) {
                return;
            }
            
            const timeSinceLastPing = Date.now() - (this.lastPingReceived || Date.now());
            
            if (timeSinceLastPing > 15000) { // 15s without ping
                console.warn(`💔 RemoteManager: ${this.host}:${this.port} - No ping received for ${Math.round(timeSinceLastPing/1000)}s - connection may be unhealthy`);
                this.handleUnhealthyConnection();
            } else {
                console.log(`💓 RemoteManager: ${this.host}:${this.port} - Connection healthy (last ping ${Math.round(timeSinceLastPing/1000)}s ago)`);
            }
        }, 5000); // Check every 5s
    }
    
    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeatMonitoring() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log(`💓 RemoteManager: Stopped heartbeat monitoring for ${this.host}:${this.port}`);
        }
    }
    
    /**
     * Handle unhealthy connection (no ping received)
     */
    handleUnhealthyConnection() {
        console.error(`💔 RemoteManager: ${this.host}:${this.port} - Connection unhealthy, triggering disconnect`);
        
        // Update connection state
        this.isConnected = false;
        
        // Emit unpaired to trigger UI update for user to reconnect
        this.emit('unpaired');
        
        // Clean up the connection
        this.stop();
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

    /**
     * Cancel ongoing connection attempts (for TLS retry scenarios)
     */
    cancelConnection() {
        console.log(`${this.host} RemoteManager.cancelConnection(): Cancelling TLS retry attempts`);
        
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
        
        // Cancel any active TLS queue operations
        if (this.tlsQueue) {
            this.tlsQueue.cancelConnection(`${this.host}:${this.port}`);
        }
    }

    stop(){
        console.log(`${this.host} RemoteManager.stop(): Cleaning up connection`);
        
        this.isManualStop = true;
        this.isConnected = false;
        
        // Cancel any ongoing connection attempts
        this.cancelConnection();
        
        // Stop heartbeat monitoring
        this.stopHeartbeatMonitoring();
        
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
