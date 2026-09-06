# Example of excalidraw collaboration server

Collaboration server for Excalidraw

If you need to use cluster mode with pm2. Checkout: https://socket.io/docs/v4/pm2/

If you are not familiar with pm2: https://pm2.keymetrics.io/docs/usage/quick-start/

# Development

- install

  ```sh
  yarn
  ```

- run development server

  ```sh
  yarn start:dev
  ```

# Optional session media bridge

The separate `excalidraw-media-stream-server` can verify that a socket currently belongs to a collaboration room. Configure both values together:

```dotenv
MEDIA_MEMBERSHIP_SECRET=a-random-shared-secret-at-least-32-characters
MEDIA_API_INTERNAL_URL=http://127.0.0.1:3003
```

Use the same `MEDIA_MEMBERSHIP_SECRET` in the media API. Keep the internal URL and its authenticated endpoints off the public reverse proxy. With both variables absent, the media bridge stays disabled and this server runs in drawing-only mode. See `../excalidraw-media-stream-server/README.md` for the complete media deployment, TLS/TURN, frontend, validation, and rollback instructions.

# Start with pm2

```
pm2 start pm2.production.json
```
