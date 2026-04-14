import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";

export interface OccupiedPort {
  port: number;
  close: () => Promise<void>;
}

export interface TcpProxy {
  host: string;
  port: number;
  enable: () => void;
  disable: () => void;
  close: () => Promise<void>;
}

export const getFreePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate a free port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

export const occupyPort = async (port: number): Promise<OccupiedPort> => {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port,
    close: async () => {
      await closeServer(server);
    },
  };
};

export const startTcpProxy = async ({
  targetHost,
  targetPort,
  listenPort,
}: {
  targetHost: string;
  targetPort: number;
  listenPort?: number;
}): Promise<TcpProxy> => {
  const port = listenPort ?? (await getFreePort());
  const activeSockets = new Set<Socket>();
  let enabled = true;

  const destroyActiveSockets = (): void => {
    for (const socket of activeSockets) {
      socket.destroy();
    }
  };

  const server = createServer((clientSocket) => {
    activeSockets.add(clientSocket);

    clientSocket.once("close", () => {
      activeSockets.delete(clientSocket);
    });
    clientSocket.once("error", () => {
      clientSocket.destroy();
    });

    if (!enabled) {
      clientSocket.destroy();
      return;
    }

    const upstreamSocket = createConnection({
      host: targetHost,
      port: targetPort,
    });

    activeSockets.add(upstreamSocket);

    upstreamSocket.once("close", () => {
      activeSockets.delete(upstreamSocket);
    });
    upstreamSocket.once("error", () => {
      upstreamSocket.destroy();
      clientSocket.destroy();
    });
    clientSocket.once("error", () => {
      upstreamSocket.destroy();
    });

    clientSocket.pipe(upstreamSocket);
    upstreamSocket.pipe(clientSocket);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    host: "127.0.0.1",
    port,
    enable: () => {
      enabled = true;
    },
    disable: () => {
      enabled = false;
      destroyActiveSockets();
    },
    close: async () => {
      enabled = false;
      destroyActiveSockets();
      await closeServer(server);
    },
  };
};
