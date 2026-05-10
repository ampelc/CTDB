pnpm run wrangler kv key put --binding=DB "admin.html" "$(cat src/admin.html)" --remote
pnpm run wrangler kv key put --binding=DB "extension.js" "$(cat src/extension.js)" --remote
pnpm run wrangler deploy
