# ACR Pack Verification

**Pack:** ACR - Autonomous Contextual Recall
**Version:** 1.0.0

All items must pass before installation is complete.

---

## File Verification

### Binary
- [ ] `~/bin/acr` exists
- [ ] `~/bin/acr` is executable (`-rwxr-xr-x`)
- [ ] `~/bin/acr --help` shows usage

### Hook
- [ ] `~/.claude/hooks/ACR.hook.ts` exists
- [ ] Hook is executable (`chmod +x`)
- [ ] Hook has shebang: `#!/Users/.../.bun/bin/bun`

### Source (if keeping for development)
- [ ] `src/cli.ts` exists
- [ ] `src/tier1-grep.ts` exists
- [ ] `src/tier2-resona.ts` exists
- [ ] `tests/` directory has test files

---

## Configuration Verification

### settings.json Hook Registration
- [ ] `~/.claude/settings.json` exists
- [ ] `hooks.UserPromptSubmit` array contains ACR hook entry
- [ ] Hook command path is correct

```bash
# Verify hook registration
cat ~/.claude/settings.json | grep -A3 "ACR.hook.ts"
```

### Environment (Optional)
- [ ] `ACR_ENABLED` not set to "false" (or unset)
- [ ] Ollama running if Tier 2 desired: `curl http://localhost:11434/api/tags`

---

## Functional Verification

### Tier 1 (Grep) - Required
```bash
# Should return results or "No matches"
~/bin/acr "test"
```
- [ ] Command completes without error
- [ ] Output shows "Tier 1" section

### Tier 2 (Semantic) - Optional
```bash
# Force Tier 2 activation
~/bin/acr --tier2 "remember that discussion"
```
- [ ] Command completes without error
- [ ] Output shows "Tier 2" section (if Ollama available)
- [ ] Graceful "Tier 2 unavailable" message (if Ollama not running)

### Hook Integration
```bash
# Simulate hook input
echo '{"prompt":"test query for ACR"}' | bun ~/.claude/hooks/ACR.hook.ts
```
- [ ] Outputs `<system-reminder>` block
- [ ] Contains "ACR Context" header
- [ ] Exits with code 0

### Status Check
```bash
~/bin/acr --status
```
- [ ] Shows session count
- [ ] Shows index state (if indexed)

---

## Performance Verification

```bash
# Time a query
time ~/bin/acr "performance test"
```
- [ ] Tier 1 completes in <100ms
- [ ] Tier 2 completes in <500ms (if enabled)

---

## Code Integrity Check

```bash
# Verify source file count
ls -1 src/*.ts | wc -l
```
- [ ] At least 20 source files present

```bash
# Verify test count
bun test --dry-run 2>&1 | tail -5
```
- [ ] 600+ tests registered

```bash
# Run tests (optional but recommended)
bun test
```
- [ ] All tests pass (0 failures)

---

## Summary Checklist

| Category | Status |
|----------|--------|
| Binary installed | [ ] |
| Hook installed | [ ] |
| Hook registered in settings.json | [ ] |
| Tier 1 functional | [ ] |
| Tier 2 functional (or graceful degradation) | [ ] |
| Tests pass | [ ] |

---

## Sign-off

- [ ] All required items verified
- [ ] ACR responds to prompts in Claude Code sessions
- [ ] Ready for use

**Verified by:** _______________
**Date:** _______________
