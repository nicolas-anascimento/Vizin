// Cliente Socket.IO único. A conexão só é aberta explicitamente após a sessão REST.
(function () {
  "use strict";

  let socket = null;

  function connect() {
    if (socket) {
      if (!socket.connected && !socket.active) socket.connect();
      return socket;
    }
    if (typeof window.io !== "function") return null;

    const token = localStorage.getItem("token");
    socket = window.io({
      autoConnect: false,
      withCredentials: true,
      auth: token ? { token } : {},
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socket.on("connect", () => {
      window.dispatchEvent(new CustomEvent("vizin:socket-status", {
        detail: { connected: true },
      }));
    });
    socket.on("disconnect", () => {
      window.dispatchEvent(new CustomEvent("vizin:socket-status", {
        detail: { connected: false },
      }));
    });
    socket.on("connect_error", (error) => {
      window.dispatchEvent(new CustomEvent("vizin:socket-status", {
        detail: { connected: false, error: error.message },
      }));
    });
    socket.on("notification:new", (notification) => {
      window.dispatchEvent(new CustomEvent("vizin:notification", {
        detail: notification,
      }));
    });
    socket.connect();
    return socket;
  }

  function disconnect() {
    socket?.disconnect();
    socket = null;
  }

  window.SocketVizin = {
    connect,
    disconnect,
    get: () => socket,
    isConnected: () => !!socket?.connected,
  };
})();
