# ACR Pack Installation

**Pack:** ACR - Autonomous Contextual Recall
**Version:** 1.0.0
**Type:** Infrastructure

This document guides AI agents through ACR installation. Follow phases sequentially.

---

## Phase 1: System Analysis

Before installation, check existing state:

```bash
# Check if ACR binary exists
ls -la ~/bin/acr 2>/dev/null || echo "ACR binary not installed"

# Check if hook exists
ls -la ~/.claude/hooks/ACR.hook.ts 2>/dev/null || echo "ACR hook not installed"

# Check if resona (embedding service) is available
curl -s http://localhost:11434/api/tags | head -5 || echo "Ollama not running"

# Check settings.json for existing hooks
cat ~/.claude/settings.json 2>/dev/null | grep -A5 "UserPromptSubmit" || echo "No UserPromptSubmit hooks"
```

**Decision Points:**
- If ACR binary exists: Ask user about upgrade vs fresh install
- If hook exists: Backup before overwriting
- If Ollama not running: Warn that Tier 2 (semantic) won't work

---

## Phase 2: User Questions

Use `AskUserQuestion` to gather:

1. **Installation Type**
   - Fresh install
   - Upgrade existing installation

2. **Binary Location** (default: `~/bin/acr`)
   - Custom path if desired

3. **Enable Tier 2 Semantic Search?**
   - Yes (requires Ollama with nomic-embed-text)
   - No (Tier 1 grep only)

---

## Phase 3: Backup

If upgrading, create backups:

```bash
# Create backup directory
mkdir -p ~/.acr-backup/$(date +%Y%m%d-%H%M%S)

# Backup existing binary
cp ~/bin/acr ~/.acr-backup/$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true

# Backup existing hook
cp ~/.claude/hooks/ACR.hook.ts ~/.acr-backup/$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true
```

---

## Phase 4: Installation

Execute these steps in order:

### 4.1 Install Dependencies

```bash
cd /path/to/acr
bun install
```

### 4.2 Build Binary

```bash
bun build src/cli.ts --compile --outfile ~/bin/acr
chmod +x ~/bin/acr
```

### 4.3 Install Hook

```bash
# Copy hook to Claude hooks directory
mkdir -p ~/.claude/hooks
cp pack/hooks/ACR.hook.ts ~/.claude/hooks/
chmod +x ~/.claude/hooks/ACR.hook.ts
```

### 4.4 Register Hook

Add to `~/.claude/settings.json` under `hooks.UserPromptSubmit`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "bun run $HOME/.claude/hooks/ACR.hook.ts"
      }
    ]
  }
}
```

**Note:** If `UserPromptSubmit` already has hooks, append to the array.

### 4.5 Initialize Session Index (Optional)

For Tier 2 semantic search on session history:

```bash
# Index Claude Code sessions
~/bin/acr --index-sessions

# Verify indexing worked
~/bin/acr --status
```

---

## Phase 5: Verification

Run the VERIFY.md checklist. All items must pass.

```bash
# Quick verification
~/bin/acr --help
~/bin/acr "test query"
```

---

## Phase 6: Personalization (Optional)

### Configure Token Budget

Edit `~/.claude/hooks/ACR.hook.ts` to adjust:
- `MIN_PROMPT_LENGTH` (default: 10)
- `MAX_QUERY_LENGTH` (default: 500)

### Set Environment Variables

```bash
# Disable ACR temporarily
export ACR_ENABLED=false

# Disable only Tier 2
export ACR_TIER2_ENABLED=false
```

### Schedule Automatic Indexing

For automatic session indexing, create a launchd plist:

```bash
cp /path/to/acr/com.acr.indexer.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.acr.indexer.plist
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "ACR: Binary not found" | Run Phase 4.2 again |
| "Ollama not running" | Start Ollama: `ollama serve` |
| No semantic results | Run `acr --index-sessions` |
| Hook not firing | Check settings.json registration |

---

## Uninstallation

```bash
# Remove binary
rm ~/bin/acr

# Remove hook
rm ~/.claude/hooks/ACR.hook.ts

# Remove from settings.json (manual edit)
# Remove the ACR entry from hooks.UserPromptSubmit array

# Remove index state (optional)
rm -rf ~/.config/acr/
```
