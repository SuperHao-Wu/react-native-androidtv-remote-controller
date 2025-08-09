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
