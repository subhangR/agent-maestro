// Public surface of the API services layer.
//
// Ledger builds a ServerConfig from the persisted host (via buildServerConfig)
// and instantiates MaestroClient; its fetch-actions call the client's methods.
// Pulse consumes ServerConfig.wsUrl / ptyWsUrl for the entity-sync + /pty
// sockets. v1 = NO AUTH (getToken returns null).

export {
  buildServerConfig,
  deriveWsUrl,
  deriveServerUrl,
  normalizeApiBaseUrl,
  normalizeWsUrl,
  type ServerConfig,
} from './config/serverConfig';

export {
  MaestroClient,
  type MaestroClientOptions,
  type UploadTaskImageBody,
  type InjectDiagramBody,
} from './http/MaestroClient';

export { MaestroApiError, TimeoutError, NetworkError } from './http/errors';
export { buildQuery } from './http/buildQuery';
export { DEFAULT_TIMEOUT_MS, DEFAULT_SERVER_PORT, HEALTH_PATH } from './constants';
