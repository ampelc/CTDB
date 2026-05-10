pnpm run wrangler kv key put --binding=DB "admin.html" "$(cat src/admin.html)"
pnpm run wrangler kv key put --binding=DB "extension.js" "$(cat src/extension.js)"

