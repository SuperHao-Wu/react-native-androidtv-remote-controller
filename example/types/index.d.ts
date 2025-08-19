// TcpSockets is now bundled in react-native-androidtv-remote
declare module 'net' {
    // Note: TcpSockets types are now internal to react-native-androidtv-remote
    // These declarations may need updating if net/tls module usage is required
    export = any;
}

declare module 'tls' {
    // Note: TcpSockets types are now internal to react-native-androidtv-remote
    // These declarations may need updating if net/tls module usage is required
    export const Server: any;
    export const TLSSocket: any;
    export const connect: any;
    export const createServer: any;
}

// Minimal typings for react-native-androidtv-remote used by the example app
declare module 'react-native-androidtv-remote' {
  import { EventEmitter } from 'events';

  export type Certificate = {
    key: string | null;
    cert: string | null;
    androidKeyStore?: string;
    certAlias?: string;
    keyAlias?: string;
  };

  export interface AndroidRemoteOptions {
    pairing_port?: number;
    remote_port?: number;
    service_name?: string;
    systeminfo?: { manufacturer: string; model: string };
    cert?: Certificate;
  }

  export class AndroidRemote extends EventEmitter {
    constructor(host: string, options: AndroidRemoteOptions);
    start(): Promise<any>;
    stop(): void;
    sendKey(key: number, direction: number): any;
    sendPower(): any;
    sendAppLink(appLink: string): any;
    getCertificate(): Certificate | null;
    pairingManager?: any;
  }

  export const RemoteKeyCode: Record<string, number>;
  export const RemoteDirection: { SHORT: number; LONG: number };

  export class CertificateManager {
    static saveCertificate(host: string, certificatePem: string, privateKeyPem: string): boolean;
    static getCertificate(host: string): object | null;
    static hasCertificate(host: string): boolean;
    static clearCertificate(host: string): boolean;
    static clearAllCertificates(): void;
    static getAllHosts(): string[];
    static isValidCertificateData(certData: object): boolean;
    static getCertificateInfo(host: string): object;
  }

  const _default: {
    AndroidRemote: typeof AndroidRemote;
    RemoteKeyCode: typeof RemoteKeyCode;
    RemoteDirection: typeof RemoteDirection;
    CertificateManager: typeof CertificateManager;
  };
  export default _default;
}
